import type { Action } from '../src/lib/types'
import { applyActions, getVersion, readState, type Env } from './db'
import { syncAll } from './sheets'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

/** Constant-time-ish compare so a wrong PIN doesn't leak its length by timing. */
function pinMatches(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function isAdmin(req: Request, env: Env): boolean {
  const pin = req.headers.get('x-admin-pin') ?? ''
  // With no PIN configured the app is wide open — fine for a laptop-only test,
  // but `wrangler secret put ADMIN_PIN` before anyone else has the URL.
  if (!env.ADMIN_PIN) return true
  return pin.length > 0 && pinMatches(pin, env.ADMIN_PIN)
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req)

    try {
      // --- public reads: this is what players load ---
      if (path === '/api/state' && req.method === 'GET') {
        return json(await readState(env.DB))
      }

      // Cheap poll target — clients only refetch the full state when this moves.
      if (path === '/api/version' && req.method === 'GET') {
        return json({ version: await getVersion(env.DB), needsPin: !!env.ADMIN_PIN })
      }

      // --- the Google Sheets webhook (Apps Script calls this on every edit) ---
      if (path === '/api/hook' && req.method === 'POST') {
        const token = url.searchParams.get('token') ?? req.headers.get('x-hook-token') ?? ''
        if (!env.SHEET_HOOK_TOKEN || token !== env.SHEET_HOOK_TOKEN) return json({ error: 'Bad token' }, 403)
        // Answer the sheet immediately; the sync finishes in the background.
        ctx.waitUntil(syncAll(env.DB))
        return json({ ok: true })
      }

      // --- everything below changes data and needs the PIN ---
      if (path === '/api/check' && req.method === 'POST') {
        return isAdmin(req, env) ? json({ ok: true }) : json({ error: 'Wrong PIN' }, 401)
      }

      if (!isAdmin(req, env)) return json({ error: 'Wrong PIN' }, 401)

      if (path === '/api/actions' && req.method === 'POST') {
        const body = (await req.json()) as { actions?: Action[] }
        const actions = Array.isArray(body.actions) ? body.actions : []
        if (actions.length > 200) return json({ error: 'Too many actions in one go' }, 413)
        await applyActions(env.DB, actions)
        return json(await readState(env.DB))
      }

      if (path === '/api/sync' && req.method === 'POST') {
        const eventId = url.searchParams.get('event') ?? undefined
        const reports = await syncAll(env.DB, eventId)
        return json({ reports, ...(await readState(env.DB)) })
      }

      return json({ error: 'Not found' }, 404)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Server error'
      return json({ error: message }, 500)
    }
  },

  // Fallback for the webhook: even if Apps Script is not installed, the sheet
  // is picked up within a minute.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncAll(env.DB))
  },
} satisfies ExportedHandler<Env>
