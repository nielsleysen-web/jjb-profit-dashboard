// lib/gsheets.js
// Rijen schrijven in een Google Sheet met hetzelfde service account als Google Drive
// (GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY). De Sheet moet gedeeld zijn met dat
// e-mailadres als Editor, en de Google Sheets API moet aan staan in Google Cloud.

import axios from "axios";
import crypto from "crypto";
import { normalizePrivateKey } from "./gdrive";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

let tokenCache = { token: null, expiresAt: 0 };
const b64url = (input) => Buffer.from(input).toString("base64url");

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;
  const email = process.env.GOOGLE_SA_EMAIL;
  if (!email) throw new Error("GOOGLE_SA_EMAIL ontbreekt");
  const key = normalizePrivateKey(process.env.GOOGLE_SA_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key, "base64url");
  const { data } = await axios.post(
    TOKEN_URL,
    new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${signature}` }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

// Kolomletter voor een 1-gebaseerd kolomnummer (1 → A, 17 → Q)
const col = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/**
 * Zet een rij in het eerste tabblad: bestaat er al een rij met `key` in kolom A,
 * dan wordt die overschreven, anders komt er een nieuwe rij onderaan.
 */
export async function upsertRow(sheetId, key, values) {
  const token = await getToken();
  const h = { Authorization: `Bearer ${token}` };
  const { data } = await axios.get(`${SHEETS_API}/${sheetId}/values/A:A`, { headers: h, timeout: 15000 });
  const rows = data.values || [];
  const idx = rows.findIndex((r) => r[0] === key);
  const last = col(values.length);
  if (idx >= 0) {
    const n = idx + 1;
    await axios.put(`${SHEETS_API}/${sheetId}/values/A${n}:${last}${n}?valueInputOption=RAW`, { values: [values] }, { headers: h, timeout: 15000 });
    return { row: n, updated: true };
  }
  await axios.post(`${SHEETS_API}/${sheetId}/values/A:${last}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: [values] }, { headers: h, timeout: 15000 });
  return { row: rows.length + 1, updated: false };
}
