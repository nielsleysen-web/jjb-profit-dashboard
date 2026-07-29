// pages/api/elevenlabs-voices.js
// Live sync of ElevenLabs voices for the voice dropdown.
// Requires env var ELEVENLABS_API_KEY. Cached for 10 minutes.

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

let cache = { voices: null, at: 0 };

export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: "Not signed in" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (cache.voices && Date.now() - cache.at < 10 * 60 * 1000) {
      return res.status(200).json({ success: true, voices: cache.voices });
    }

    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      return res.status(200).json({ success: true, voices: [], warning: "ELEVENLABS_API_KEY not set" });
    }

    const response = await axios.get("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key, Accept: "application/json" },
      timeout: 15000,
    });

    const raw = response.data?.voices || [];
    const voices = raw.map((v) => ({
      id: v.voice_id,
      name: v.name || v.voice_id,
    }));

    cache = { voices, at: Date.now() };
    return res.status(200).json({ success: true, voices });
  } catch (error) {
    console.error("ElevenLabs voices error:", error.response?.data || error.message);
    return res.status(200).json({ success: true, voices: [], warning: "Could not load ElevenLabs voices — check the API key" });
  }
}
