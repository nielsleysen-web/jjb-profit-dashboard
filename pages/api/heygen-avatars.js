// pages/api/heygen-avatars.js
// Live sync of HeyGen avatars for the A-Roll "Existing" dropdown.
// Requires env var HEYGEN_API_KEY. Cached for 10 minutes.

import axios from "axios";
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const sessionToken = match ? match[1] : null;
  if (!sessionToken) return null;
  const [body, sig] = sessionToken.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

let cache = { avatars: null, at: 0 };

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: "Not signed in" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (cache.avatars && Date.now() - cache.at < 10 * 60 * 1000) {
      return res.status(200).json({ success: true, avatars: cache.avatars });
    }

    const key = process.env.HEYGEN_API_KEY;
    if (!key) {
      return res.status(200).json({ success: true, avatars: [], warning: "HEYGEN_API_KEY not set" });
    }

    const response = await axios.get("https://api.heygen.com/v2/avatars", {
      headers: { "X-Api-Key": key, Accept: "application/json" },
      timeout: 15000,
    });

    const raw = response.data?.data?.avatars || [];
    const avatars = raw.map((a) => ({
      id: a.avatar_id,
      name: a.avatar_name || a.avatar_id,
      preview: a.preview_image_url || null,
    }));

    cache = { avatars, at: Date.now() };
    return res.status(200).json({ success: true, avatars });
  } catch (error) {
    console.error("HeyGen avatars error:", error.response?.data || error.message);
    return res.status(200).json({ success: true, avatars: [], warning: "Could not load HeyGen avatars — check the API key" });
  }
}
