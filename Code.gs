/**
 * Blood donor register backend (Google Apps Script, bound to a Google Sheet).
 *
 * Setup: Extensions > Apps Script, paste this file, run setup() once, then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * See README.md for the full steps.
 *
 * Privacy design:
 *  - Registrations sheet holds adult registrants who gave explicit consent.
 *  - FutureHeroes sheet holds ONLY a timestamp, college and source for under-18s.
 *    No name, number or any personal data is ever stored for them.
 *  - Public endpoints return aggregated counts only (stats) or a single
 *    referral count for a code (me). Individual rows are never exposed.
 */

// Keep this list identical to CONFIG.COLLEGES in index.html
const COLLEGES = ['Engineering College', 'Business School', 'Paramedical College', 'Pharmacy College', 'Nursing College', 'Ayurveda College', 'Optometry School', 'Other'];
const CONTACT_PREFS = ['WhatsApp', 'Call', 'SMS'];
const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const OUTCOMES = ['eligible', 'reserve', 'future'];

const SHEET_REG = 'Registrations';
const SHEET_ANON = 'FutureHeroes';
const REG_HEADERS = ['Timestamp', 'Code', 'Name', 'Mobile', 'College', 'Contact via', 'Blood group (self-reported)', 'Outcome', 'Quiz points', 'Source', 'Referred by', 'Consent', 'Consent time'];
const ANON_HEADERS = ['Timestamp', 'College', 'Source'];

const COL = { CODE: 2, MOBILE: 4, COLLEGE: 5, REF: 11 }; // 1-based column numbers in Registrations

/** Run once from the editor to create the sheets. Safe to run again. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_REG, REG_HEADERS);
  ensureSheet_(ss, SHEET_ANON, ANON_HEADERS);
}

function ensureSheet_(ss, name, headers) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  // Plain-text format: stops spreadsheet formulas from ever running on typed input.
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, 1, rows, headers.length).setNumberFormat('@');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(msg) { return json_({ ok: false, error: msg }); }

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'stats') return json_(stats_());
  if (p.action === 'me') return json_(me_(String(p.code || '')));
  return json_({ ok: true, service: 'blood-donor-register' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return fail_('Bad request.'); }
  if (!d || typeof d !== 'object') return fail_('Bad request.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json_({ ok: false, error: 'Server busy.', retry: true });
  try {
    return json_(d.anon ? handleAnon_(d) : handleRegister_(d));
  } catch (err) {
    return json_({ ok: false, error: 'Server error.', retry: true });
  } finally {
    lock.releaseLock();
  }
}

function handleAnon_(d) {
  if (COLLEGES.indexOf(d.college) < 0) return { ok: false, error: 'Unknown college.' };
  const src = /^[A-Za-z0-9_-]{0,20}$/.test(d.src || '') ? (d.src || '') : '';
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ANON);
  sh.appendRow([new Date().toISOString(), d.college, src]);
  CacheService.getScriptCache().remove('stats');
  return { ok: true };
}

function handleRegister_(d) {
  if (d.hp) return { ok: true }; // honeypot: bots fill this; pretend success, store nothing

  const name = String(d.name || '').replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}][\p{L}\p{M} .'-]{1,59}$/u.test(name)) return { ok: false, error: 'Please enter a valid name.' };
  const mobile = String(d.mobile || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(mobile)) return { ok: false, error: 'Please enter a valid mobile number.' };
  if (COLLEGES.indexOf(d.college) < 0) return { ok: false, error: 'Unknown college.' };
  if (CONTACT_PREFS.indexOf(d.contact) < 0) return { ok: false, error: 'Invalid contact preference.' };
  const bg = String(d.bloodGroup || '');
  if (BLOOD_GROUPS.indexOf(bg) < 0) return { ok: false, error: 'Invalid blood group.' };
  if (OUTCOMES.indexOf(d.outcome) < 0) return { ok: false, error: 'Invalid outcome.' };
  if (d.consent !== true) return { ok: false, error: 'Consent is required.' };
  const code = String(d.id || '');
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return { ok: false, error: 'Invalid code.' };
  const quiz = Math.max(0, Math.min(100, parseInt(d.quiz, 10) || 0));
  const src = /^[A-Za-z0-9_-]{0,20}$/.test(d.src || '') ? (d.src || '') : '';

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REG);
  const last = sh.getLastRow();
  const keys = last > 1 ? sh.getRange(2, COL.CODE, last - 1, COL.MOBILE - COL.CODE + 1).getValues() : [];

  // Same code (retry) or same mobile (already registered): return the existing code, add nothing.
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === code) return { ok: true, code: code, duplicate: false };
    if (String(keys[i][2]) === mobile) return { ok: true, code: String(keys[i][0]), duplicate: true };
  }

  // Credit a referral only if the referring code exists and is not this one.
  let ref = /^[A-HJ-NP-Z2-9]{6}$/.test(d.ref || '') ? d.ref : '';
  if (ref === code) ref = '';
  if (ref && !keys.some(function (k) { return String(k[0]) === ref; })) ref = '';

  const now = new Date().toISOString();
  sh.appendRow([now, code, name, mobile, d.college, d.contact, bg, d.outcome, quiz, src, ref, 'yes', now]);
  CacheService.getScriptCache().remove('stats');
  return { ok: true, code: code, duplicate: false };
}

/** Aggregated counts only. Cached for 15 seconds so a busy leaderboard screen is cheap. */
function stats_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('stats');
  if (hit) return JSON.parse(hit);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reg = ss.getSheetByName(SHEET_REG);
  const anon = ss.getSheetByName(SHEET_ANON);
  const counts = {};
  COLLEGES.forEach(function (c) { counts[c] = 0; });
  let total = 0;
  if (reg && reg.getLastRow() > 1) {
    reg.getRange(2, COL.COLLEGE, reg.getLastRow() - 1, 1).getValues().forEach(function (r) {
      const c = String(r[0]);
      if (Object.prototype.hasOwnProperty.call(counts, c)) { counts[c]++; total++; }
    });
  }
  const future = anon && anon.getLastRow() > 1 ? anon.getLastRow() - 1 : 0;
  const out = { ok: true, colleges: counts, total: total, futureHeroes: future, updated: new Date().toISOString() };
  cache.put('stats', JSON.stringify(out), 15);
  return out;
}

/** How many registrants joined through one referral code. Returns nothing else. */
function me_(code) {
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return { ok: false, error: 'Invalid code.' };
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_REG);
  let n = 0;
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, COL.REF, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (String(r[0]) === code) n++;
    });
  }
  return { ok: true, referrals: n };
}
