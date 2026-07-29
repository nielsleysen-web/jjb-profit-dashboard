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

    const headers = { "X-Api-Key": key, Accept: "application/json" };

    // Alleen EIGEN avatar-groepen ophalen (geen publieke library) — klein & snel
    const groupsRes = await axios.get("https://api.heygen.com/v2/avatar_group.list?include_public=false", {
      headers,
      timeout: 20000,
    });

    const groups = groupsRes.data?.data?.avatar_group_list || [];
    const avatars = [];

    // Per groep de avatars ophalen (max 15 groepen als vangrail)
    for (const g of groups.slice(0, 15)) {
      try {
        const gRes = await axios.get(`https://api.heygen.com/v2/avatar_group/${g.id}/avatars`, {
          headers,
          timeout: 20000,
        });
        const list = gRes.data?.data?.avatar_list || [];
        for (const a of list) {
          avatars.push({
            id: a.avatar_id || a.id,
            name: a.avatar_name || a.name || g.name || a.avatar_id,
            preview: a.preview_image_url || a.image_url || null,
          });
        }
      } catch (err) {
        console.warn(`HeyGen groep ${g.id} overslaan:`, err.message);
      }
    }

    cache = { avatars, at: Date.now() };
    return res.status(200).json({
      success: true,
      avatars,
      ...(avatars.length === 0 ? { warning: "No own avatars found in HeyGen (avatar groups are empty)" } : {}),
    });
  } catch (error) {
    const detail = error.response
      ? `HeyGen antwoordde ${error.response.status}: ${JSON.stringify(error.response.data).slice(0, 200)}`
      : error.message;
    console.error("HeyGen avatars error:", detail);
    return res.status(200).json({ success: true, avatars: [], warning: `Could not load HeyGen avatars — ${detail}` });
  }
}
