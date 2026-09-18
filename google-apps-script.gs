/**
 * Brackets — instant sign-up sync.
 *
 * Paste this into the Google Sheet (Extensions → Apps Script), fill in the two
 * values below, then run `install` once and approve the permissions prompt.
 * After that, every edit to the sheet pokes the app and the new team shows up
 * within a second or two.
 *
 * Without this the app still picks up changes — the Worker re-reads the sheet
 * once a minute on a cron. This just removes the wait.
 */

// Your Worker's URL + the token you set with: wrangler secret put SHEET_HOOK_TOKEN
const WEBHOOK_URL = 'https://brackets.YOUR-SUBDOMAIN.workers.dev/api/hook';
const HOOK_TOKEN = 'PASTE_THE_SAME_TOKEN_HERE';

/** Run this once, by hand, from the Apps Script editor. */
function install() {
  const ss = SpreadsheetApp.getActive();
  // Clear out old copies so running install twice doesn't double-fire.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'notifyBrackets') ScriptApp.deleteTrigger(t);
  });

  // onEdit must be an *installable* trigger — the simple kind isn't allowed to
  // make network calls.
  ScriptApp.newTrigger('notifyBrackets').forSpreadsheet(ss).onEdit().create();
  // Catches inserted/deleted rows, which onEdit alone misses.
  ScriptApp.newTrigger('notifyBrackets').forSpreadsheet(ss).onChange().create();
  // Only fires if sign-ups arrive through a linked Google Form.
  try {
    ScriptApp.newTrigger('notifyBrackets').forSpreadsheet(ss).onFormSubmit().create();
  } catch (e) {
    // no form attached — fine
  }

  notifyBrackets();
  SpreadsheetApp.getActive().toast('Brackets sync installed');
}

function notifyBrackets() {
  UrlFetchApp.fetch(WEBHOOK_URL + '?token=' + encodeURIComponent(HOOK_TOKEN), {
    method: 'post',
    muteHttpExceptions: true,
  });
}

/** Handy for checking the wiring: run this and watch the app. */
function testPing() {
  const res = UrlFetchApp.fetch(WEBHOOK_URL + '?token=' + encodeURIComponent(HOOK_TOKEN), {
    method: 'post',
    muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
