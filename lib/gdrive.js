// lib/gdrive.js
// Google Drive-mappen aanmaken vanuit de Operations Centre — zonder extra npm-pakket.
// Auth: Google service account (JWT → OAuth2 access token), ondertekend met node crypto.
//
// Vereiste env vars (Vercel):
//   GOOGLE_SA_EMAIL          service-account e-mail (…@….iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY    private key uit de JSON-sleutel ("-----BEGIN PRIVATE KEY-----\n…")
//   GDRIVE_CREATIVES_FOLDER  map-ID van de Creatives-hoofdmap
//
// De Creatives-hoofdmap moet in Google Drive gedeeld zijn met GOOGLE_SA_EMAIL als Editor.

import axios from "axios";
import crypto from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SCOPE = "https://www.googleapis.com/auth/drive";

export const driveConfigured = () =>
  !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY && process.env.GDRIVE_CREATIVES_FOLDER);

/* ---------------- access token ---------------- */
let tokenCache = { token: null, expiresAt: 0 };

const b64url = (input) => Buffer.from(input).toString("base64url");

/**
 * Zet elke plakvariant van de private key om naar geldige PEM.
 * Vangt: omringende aanhalingstekens, letterlijke \n, \r\n, ontbrekende
 * regeleindes, en base64 die op één regel is geplakt.
 */
// Beschrijft de waarde zonder de sleutel zelf te lekken — voor leesbare foutmeldingen
function describeValue(s) {
  const head = s.slice(0, 14).replace(/[^\x20-\x7e]/g, "·");
  return `lengte ${s.length}, begint met "${head}…", bevat BEGIN: ${/BEGIN/i.test(s) ? "ja" : "nee"}, bevat letterlijke \\n: ${s.includes("\\n") ? "ja" : "nee"}`;
}

export function normalizePrivateKey(raw) {
  let s = String(raw || "").trim();
  if (!s) throw new Error("GOOGLE_SA_PRIVATE_KEY is leeg of niet gezet voor deze omgeving (Production/Preview)");

  // Vercel/shell laten soms de aanhalingstekens uit de JSON staan
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);

  s = s.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();

  // Iemand plakte het hele JSON-bestand in plaats van alleen private_key
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed.private_key) return normalizePrivateKey(parsed.private_key);
    } catch {
      /* val door naar de gewone afhandeling */
    }
  }

  // Losse header-detectie: newlines of extra spaties binnen "-----BEGIN PRIVATE KEY-----" zijn geen probleem
  const begin = s.match(/-{2,}\s*BEGIN[\s\S]{0,40}?KEY\s*-{2,}/i);
  const end = s.match(/-{2,}\s*END[\s\S]{0,40}?KEY\s*-{2,}/i);

  let body;
  let label = "PRIVATE KEY";
  if (begin) {
    const from = begin.index + begin[0].length;
    body = s.slice(from, end ? end.index : undefined);
    label = /RSA/i.test(begin[0]) ? "RSA PRIVATE KEY" : "PRIVATE KEY";
  } else {
    // Geen headers: als het er verder uitziet als de kale base64, dan zetten we die er zelf omheen
    body = s;
  }

  body = body.replace(/[^A-Za-z0-9+/=]/g, ""); // alles wat geen base64 is eruit
  if (body.length < 600) {
    throw new Error(
      `GOOGLE_SA_PRIVATE_KEY klopt niet — ${describeValue(s)}. Kopieer de volledige private_key uit het JSON-bestand, van -----BEGIN t/m -----END`
    );
  }

  // Base64 opnieuw in regels van 64 tekens zetten — dat is wat OpenSSL verwacht
  const lines = body.match(/.{1,64}/g).join("\n");
  const pem = `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;

  // Meteen controleren of OpenSSL hem accepteert, zodat de fout hier duidelijk is
  try {
    crypto.createPrivateKey(pem);
  } catch (e) {
    throw new Error(`GOOGLE_SA_PRIVATE_KEY kon niet gelezen worden (${e.message}) — ${describeValue(s)}`);
  }
  return pem;
}

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) return tokenCache.token;

  const email = process.env.GOOGLE_SA_EMAIL;
  if (!email) throw new Error("GOOGLE_SA_EMAIL ontbreekt");
  const key = normalizePrivateKey(process.env.GOOGLE_SA_PRIVATE_KEY);

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key, "base64url");
  const assertion = `${header}.${claim}.${signature}`;

  const { data } = await axios.post(
    TOKEN_URL,
    new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 }
  );
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

/* ---------------- mappen ---------------- */
// Drive-zoekquery: enkele quotes en backslashes moeten geëscaped worden
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

async function findFolder(name, parentId, token) {
  const q = [
    `name = '${esc(name)}'`,
    `'${esc(parentId)}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");
  const { data } = await axios.get(`${DRIVE_API}/files`, {
    params: {
      q,
      fields: "files(id, name, webViewLink)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return data.files?.[0] || null;
}

async function createFolder(name, parentId, token) {
  const { data } = await axios.post(
    `${DRIVE_API}/files`,
    { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    {
      params: { fields: "id, name, webViewLink", supportsAllDrives: true },
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 15000,
    }
  );
  return data;
}

async function findOrCreateFolder(name, parentId, token) {
  return (await findFolder(name, parentId, token)) || (await createFolder(name, parentId, token));
}

/* ---------------- naamgeving ---------------- */
// Drive verslikt zich in slashes; de rest van de naming convention blijft intact.
const safeName = (s) => String(s || "").replace(/[\\/]+/g, "-").trim().slice(0, 200) || "Untitled";

// Datum van vandaag in Hongkong-tijd (heel het team werkt op HK-tijd) → YYYY-MM-DD
export function todayHK() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Zorgt dat Creatives / <product> / <YYYY-MM-DD> / <naming convention> bestaat
 * en geeft de deelbare link naar de diepste map terug.
 * Bestaande mappen worden hergebruikt — twee keer draaien maakt geen dubbele map.
 */
export async function ensureCreativeFolder({ productName, dateFolder, taskFolder }) {
  const root = process.env.GDRIVE_CREATIVES_FOLDER;
  if (!root) throw new Error("GDRIVE_CREATIVES_FOLDER ontbreekt");
  const token = await getAccessToken();

  const product = await findOrCreateFolder(safeName(productName), root, token);
  const day = await findOrCreateFolder(safeName(dateFolder), product.id, token);
  const task = await findOrCreateFolder(safeName(taskFolder), day.id, token);

  return task.webViewLink || `https://drive.google.com/drive/folders/${task.id}`;
}
