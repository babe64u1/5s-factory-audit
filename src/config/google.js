/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GOOGLE CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Values are loaded from environment variables.
 *
 * LOCAL DEV:  Edit .env.local (never committed to git)
 * VERCEL:     Set in Vercel Dashboard → Project → Settings → Environment Variables
 *
 *   VITE_GOOGLE_CLIENT_ID  → Google Cloud Console → APIs & Services → Credentials
 *   VITE_SPREADSHEET_ID    → From URL: docs.google.com/spreadsheets/d/ID/edit
 *   VITE_DRIVE_FOLDER_ID   → From URL: drive.google.com/drive/folders/ID
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const GOOGLE_CONFIG = {
  // ── OAuth Client ID ───────────────────────────────────────────────────────
  CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  // ── Google Sheets: Spreadsheet ID ─────────────────────────────────────────
  SPREADSHEET_ID: import.meta.env.VITE_SPREADSHEET_ID || '',

  // ── Google Drive: Photo Folder ID ─────────────────────────────────────────
  DRIVE_FOLDER_ID: import.meta.env.VITE_DRIVE_FOLDER_ID || '',

  // ── OAuth Scopes ──────────────────────────────────────────────────────────
  SCOPES: [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/drive.file',       // Upload files to Drive
    'https://www.googleapis.com/auth/spreadsheets',     // Read/write Sheets
  ].join(' '),

  // ── Sheet tab names (must match your Google Spreadsheet tab names) ────────
  SHEETS: {
    AUDITS: 'Audits',
    RED_TAGS: 'RedTags',
    ACTION_ITEMS: 'ActionItems',
    SCHEDULES: 'Schedules',
    USERS_APPROVED: 'Users_Approved',
    USERS_PENDING: 'Users_Pending',
    ZONES: 'Zones',
    DEPARTMENTS: 'Departments',
  },
};

/** Check if Google config has been filled in */
export const isGoogleConfigured = () =>
  !!GOOGLE_CONFIG.CLIENT_ID &&
  !!GOOGLE_CONFIG.SPREADSHEET_ID &&
  !!GOOGLE_CONFIG.DRIVE_FOLDER_ID;

