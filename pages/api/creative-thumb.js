// pages/api/creative-thumb.js
// Thumbnail van een creative uit Google Drive, opgehaald via het service-account
// en doorgegeven aan de browser. De Drive-thumbnail zelf is niet publiek, dit wel
// (achter login), en de CDN cachet hem een dag.
//
// GET /api/creative-thumb?id=<drive file id>

import crypto from "crypto";
import { fetchThumbnail, driveConfigured } from "../../lib/gdrive";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

function hasSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  if (!match) return false;
  const [body, sig] = match[1].split(".");
  if (!body || !sig) return false;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expected) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return !!payload.exp && payload.exp > Date.now();
  } catch {
    return false;
  }
}

// 1×1 transparante gif als er geen thumbnail is — de <img> valt dan terug op de productfoto via onError
const EMPTY = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  if (!hasSession(req)) return res.status(401).end();
  const id = String(req.query.id || "");
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return res.status(400).end();
  if (!driveConfigured()) return res.status(404).end();

  try {
    const thumb = await fetchThumbnail(id, 640);
    if (!thumb) {
      res.setHeader("Cache-Control", "private, max-age=600");
      res.setHeader("Content-Type", "image/gif");
      return res.status(404).send(EMPTY);
    }
    res.setHeader("Content-Type", thumb.contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.status(200).send(thumb.buffer);
  } catch (e) {
    console.warn("creative-thumb:", e.response?.data?.error?.message || e.message);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Type", "image/gif");
    return res.status(404).send(EMPTY);
  }
}
