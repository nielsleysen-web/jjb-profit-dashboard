// pages/api/upload.js
// Chat attachments — uploads a file to Shopify Files (CDN) and returns a public URL.
// Requires the read_files + write_files scopes on the Shopify app.

import axios from "axios";
import crypto from "crypto";

export const config = {
  api: { bodyParser: { sizeLimit: "6mb" } },
  maxDuration: 30,
};

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

/* ---------------- session ---------------- */
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

/* ---------------- Shopify ---------------- */
let tokenCache = { token: null, expiresAt: 0 };
async function getShopifyToken(storeUrl) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) return tokenCache.token;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SHOPIFY_CLIENT_ID,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET,
  });
  const response = await axios.post(`https://${storeUrl}/admin/oauth/access_token`, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  tokenCache = {
    token: response.data.access_token,
    expiresAt: Date.now() + (response.data.expires_in || 86399) * 1000,
  };
  return tokenCache.token;
}

async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const response = await axios.post(
    `https://${storeUrl}/admin/api/2025-01/graphql.json`,
    { query, variables },
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 }
  );
  if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
  return response.data.data;
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: "Not logged in" });
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  try {
    const { filename, mimeType, data } = req.body || {};
    if (!filename || !data) return res.status(400).json({ success: false, error: "Missing file" });

    const buf = Buffer.from(data, "base64");
    if (buf.length > 3.5 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: "File too large — max 3 MB" });
    }
    const safeName = String(filename).replace(/[^\w.\-]+/g, "_").slice(0, 100) || "file";
    const mt = String(mimeType || "application/octet-stream").slice(0, 100);

    // Voicebericht? Start de transcriptie (ElevenLabs Scribe) parallel met de upload
    const transcriptPromise = (async () => {
      if (!mt.startsWith("audio/") || !process.env.ELEVENLABS_API_KEY) return "";
      try {
        const b2 = "----jjbstt" + crypto.randomBytes(6).toString("hex");
        const tparts = [];
        tparts.push(Buffer.from(`--${b2}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n`));
        tparts.push(Buffer.from(`--${b2}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${mt}\r\n\r\n`));
        tparts.push(buf);
        tparts.push(Buffer.from(`\r\n--${b2}--\r\n`));
        const tbody = Buffer.concat(tparts);
        const tr = await axios.post("https://api.elevenlabs.io/v1/speech-to-text", tbody, {
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": `multipart/form-data; boundary=${b2}` },
          maxBodyLength: Infinity,
          timeout: 20000,
        });
        return String(tr.data?.text || "").trim().slice(0, 1200);
      } catch (e) {
        console.error("Transcript error:", e.message);
        return "";
      }
    })();

    // 1. Staged upload target aanvragen
    const staged = await shopifyGraphql(
      `mutation Stage($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { message }
        }
      }`,
      { input: [{ filename: safeName, mimeType: mt, resource: "FILE", httpMethod: "POST" }] }
    );
    const stageErrs = staged?.stagedUploadsCreate?.userErrors || [];
    if (stageErrs.length) throw new Error(stageErrs.map((e) => e.message).join(", "));
    const target = staged?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) throw new Error("Could not create upload target — check that the app has the write_files scope");

    // 2. Multipart upload naar de staged URL
    const boundary = "----jjb" + crypto.randomBytes(8).toString("hex");
    const parts = [];
    for (const p of target.parameters) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${mt}\r\n\r\n`));
    parts.push(buf);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    await axios.post(target.url, body, {
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": body.length },
      maxBodyLength: Infinity,
      timeout: 25000,
    });

    // 3. Bestand registreren in Shopify Files
    const created = await shopifyGraphql(
      `mutation Create($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { id }
          userErrors { message }
        }
      }`,
      { files: [{ originalSource: target.resourceUrl, contentType: "FILE" }] }
    );
    const createErrs = created?.fileCreate?.userErrors || [];
    if (createErrs.length) throw new Error(createErrs.map((e) => e.message).join(", "));
    const fileId = created?.fileCreate?.files?.[0]?.id;
    if (!fileId) throw new Error("File registration failed");

    // 4. Wachten tot de CDN-URL beschikbaar is
    let url = "";
    for (let i = 0; i < 10 && !url; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 350 : 600));
      const node = await shopifyGraphql(
        `query Get($id: ID!) { node(id: $id) { ... on GenericFile { url fileStatus } } }`,
        { id: fileId }
      );
      if (node?.node?.fileStatus === "FAILED") throw new Error("Shopify could not process this file");
      url = node?.node?.url || "";
    }
    if (!url) {
      return res.status(500).json({ success: false, error: "File is still processing — try again in a few seconds" });
    }

    const transcript = await transcriptPromise;
    return res.status(200).json({ success: true, url, transcript });
  } catch (error) {
    console.error("Upload error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
