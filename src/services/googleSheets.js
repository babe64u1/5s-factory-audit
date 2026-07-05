/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GOOGLE SHEETS SERVICE
 * All CRUD operations for the 5S Factory Audit database stored in Google Sheets.
 *
 * Each tab uses a header row (row 1). Data starts at row 2.
 * Row order: newest records are appended at the bottom.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { GOOGLE_CONFIG } from '../config/google';
import { getValidToken } from './googleAuth';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SID = () => GOOGLE_CONFIG.SPREADSHEET_ID;

/** Build auth headers with current valid token */
async function authHeaders() {
  const token = await getValidToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** ── Generic: Read all rows from a sheet tab ──────────────────────────────
 * Returns array of objects using header row as keys.
 */
export async function readSheet(sheetName) {
  const headers = await authHeaders();
  const res = await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(sheetName)}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Sheets read error: ${res.statusText}`);
  const data = await res.json();
  const rows = data.values || [];
  if (rows.length < 2) return []; // No data rows
  const [headerRow, ...dataRows] = rows;
  return dataRows.map(row => {
    const obj = {};
    headerRow.forEach((key, i) => { obj[key] = row[i] ?? ''; });
    return obj;
  });
}

/** ── Generic: Append one row to a sheet tab ─────────────────────────────── */
export async function appendRow(sheetName, rowObject) {
  const headers = await authHeaders();
  // Get header row first to ensure correct column order
  const headerRes = await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(sheetName)}!1:1`,
    { headers }
  );
  const headerData = await headerRes.json();
  const headerRow = (headerData.values?.[0]) || Object.keys(rowObject);

  const rowValues = headerRow.map(key => rowObject[key] ?? '');

  const res = await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(sheetName)}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ values: [rowValues] }),
    }
  );
  if (!res.ok) throw new Error(`Sheets append error: ${res.statusText}`);
  return res.json();
}

/** ── Generic: Update a single row by finding a matching ID column ────────── */
export async function updateRowById(sheetName, idColumnName, id, updatedFields) {
  const headers = await authHeaders();

  // Read all data to find the row index
  const readRes = await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(sheetName)}`,
    { headers }
  );
  const data = await readRes.json();
  const rows = data.values || [];
  if (rows.length < 1) throw new Error('Sheet is empty');

  const [headerRow, ...dataRows] = rows;
  const idColIndex = headerRow.indexOf(idColumnName);
  if (idColIndex === -1) throw new Error(`Column "${idColumnName}" not found in ${sheetName}`);

  const rowIndex = dataRows.findIndex(row => row[idColIndex] === id);
  if (rowIndex === -1) throw new Error(`Row with ${idColumnName}="${id}" not found`);

  const sheetRowIndex = rowIndex + 2; // +1 for header, +1 for 1-indexed

  // Build updated row
  const existingRow = {};
  headerRow.forEach((key, i) => { existingRow[key] = dataRows[rowIndex][i] ?? ''; });
  const mergedRow = { ...existingRow, ...updatedFields };
  const rowValues = headerRow.map(key => mergedRow[key] ?? '');

  const range = `${sheetName}!A${sheetRowIndex}`;
  const updateRes = await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ values: [rowValues] }),
    }
  );
  if (!updateRes.ok) throw new Error(`Sheets update error: ${updateRes.statusText}`);
  return updateRes.json();
}

/** ── Generic: Delete a row by ID ───────────────────────────────────────── */
export async function deleteRowById(sheetName, idColumnName, id) {
  const headers = await authHeaders();

  // First get the sheet's internal sheetId (gid)
  const metaRes = await fetch(`${SHEETS_BASE}/${SID()}`, { headers });
  const meta = await metaRes.json();
  const sheet = meta.sheets?.find(s => s.properties.title === sheetName);
  if (!sheet) throw new Error(`Sheet tab "${sheetName}" not found`);
  const sheetId = sheet.properties.sheetId;

  // Find the row index
  const readRes = await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(sheetName)}`,
    { headers }
  );
  const data = await readRes.json();
  const rows = data.values || [];
  const [headerRow, ...dataRows] = rows;
  const idColIndex = headerRow.indexOf(idColumnName);
  const rowIndex = dataRows.findIndex(row => row[idColIndex] === id);
  if (rowIndex === -1) return; // Already deleted

  const sheetRowIndex = rowIndex + 1; // 0-indexed for batchUpdate, +1 for header

  const deleteRes = await fetch(
    `${SHEETS_BASE}/${SID()}:batchUpdate`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: sheetRowIndex,
              endIndex: sheetRowIndex + 1,
            }
          }
        }]
      })
    }
  );
  if (!deleteRes.ok) throw new Error(`Sheets delete error: ${deleteRes.statusText}`);
}

/** ── Initialize sheet with header row if it's empty ──────────────────────── */
export async function ensureHeaders(sheetName, headers) {
  const token = await getValidToken();
  const authHead = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const res = await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(sheetName)}!1:1`,
    { headers: authHead }
  );
  const data = await res.json();
  if (data.values?.[0]?.length > 0) return; // Already has headers

  await fetch(
    `${SHEETS_BASE}/${SID()}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: authHead,
      body: JSON.stringify({ values: [headers] }),
    }
  );
}

// ─── Domain-specific helpers ─────────────────────────────────────────────────

const S = GOOGLE_CONFIG.SHEETS;

export const sheetsDB = {
  // ── Audits ────────────────────────────────────────────────────────────────
  audits: {
    headers: ['id', 'date', 'auditor', 'role', 'zone', 'score', 'answers', 'notes'],
    getAll: () => readSheet(S.AUDITS),
    add: (audit) => appendRow(S.AUDITS, {
      ...audit,
      answers: JSON.stringify(audit.answers || {}),
    }),
  },

  // ── Red Tags ──────────────────────────────────────────────────────────────
  redTags: {
    headers: ['id', 'description', 'reason', 'disposition', 'owner', 'timestamp', 'status', 'location', 'photoUrl', 'photoId'],
    getAll: () => readSheet(S.RED_TAGS),
    add: (tag) => appendRow(S.RED_TAGS, tag),
    updateStatus: (id, status) => updateRowById(S.RED_TAGS, 'id', id, { status }),
    resolve: (id) => updateRowById(S.RED_TAGS, 'id', id, { status: 'Resolved' }),
  },

  // ── Action Items ──────────────────────────────────────────────────────────
  actionItems: {
    headers: ['id', 'title', 'severity', 'location', 'assignedTo', 'dueDate', 'status', 'photoUrl'],
    getAll: () => readSheet(S.ACTION_ITEMS),
    add: (item) => appendRow(S.ACTION_ITEMS, item),
    updateStatus: (id, status) => updateRowById(S.ACTION_ITEMS, 'id', id, { status }),
  },

  // ── Schedules ─────────────────────────────────────────────────────────────
  schedules: {
    headers: ['id', 'zone', 'auditor', 'date', 'status'],
    getAll: () => readSheet(S.SCHEDULES),
    add: (schedule) => appendRow(S.SCHEDULES, schedule),
    updateStatus: (id, status) => updateRowById(S.SCHEDULES, 'id', id, { status }),
  },

  // ── Approved Users ────────────────────────────────────────────────────────
  usersApproved: {
    headers: ['id', 'name', 'email', 'role', 'authType', 'pin', 'googleId', 'avatar', 'avatarColor', 'companyEmail', 'department', 'approvedAt'],
    getAll: () => readSheet(S.USERS_APPROVED),
    add: (user) => appendRow(S.USERS_APPROVED, user),
    delete: (id) => deleteRowById(S.USERS_APPROVED, 'id', id),
  },

  // ── Pending Users ─────────────────────────────────────────────────────────
  usersPending: {
    headers: ['id', 'name', 'email', 'avatar', 'avatarColor', 'googleId', 'requestedAt', 'status'],
    getAll: () => readSheet(S.USERS_PENDING),
    add: (user) => appendRow(S.USERS_PENDING, user),
    updateStatus: (id, status) => updateRowById(S.USERS_PENDING, 'id', id, { status }),
    delete: (id) => deleteRowById(S.USERS_PENDING, 'id', id),
  },

  // ── Zones ─────────────────────────────────────────────────────────────────
  zones: {
    headers: ['id', 'name', 'description', 'score', 'department'],
    getAll: () => readSheet(S.ZONES),
    add: (zone) => appendRow(S.ZONES, zone),
    delete: (id) => deleteRowById(S.ZONES, 'id', id),
  },

  // ── Departments ───────────────────────────────────────────────────────────
  departments: {
    headers: ['id', 'name'],
    getAll: () => readSheet(S.DEPARTMENTS),
    add: (dept) => appendRow(S.DEPARTMENTS, dept),
    delete: (id) => deleteRowById(S.DEPARTMENTS, 'id', id),
  },

  /** Initialize all sheet headers on first run */
  async initializeAllHeaders() {
    await Promise.all([
      ensureHeaders(S.AUDITS, this.audits.headers),
      ensureHeaders(S.RED_TAGS, this.redTags.headers),
      ensureHeaders(S.ACTION_ITEMS, this.actionItems.headers),
      ensureHeaders(S.SCHEDULES, this.schedules.headers),
      ensureHeaders(S.USERS_APPROVED, this.usersApproved.headers),
      ensureHeaders(S.USERS_PENDING, this.usersPending.headers),
      ensureHeaders(S.ZONES, this.zones.headers),
      ensureHeaders(S.DEPARTMENTS, this.departments.headers),
    ]);
  },
};
