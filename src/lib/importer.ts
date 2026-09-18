import { parseGrid, type ParsedSheet } from './sheetParse'

export { eventNameFromSheet } from './sheetParse'
export type { ParsedSheet, ParsedTeam } from './sheetParse'

/** Read a spreadsheet the user picked in the file input. */
export async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  // Loaded on demand — the spreadsheet parser is bigger than the rest of the app.
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map((name) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, {
      header: 1,
      blankrows: true,
      defval: '',
    })
    return parseGrid(
      name,
      grid.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : [])),
    )
  })
}
