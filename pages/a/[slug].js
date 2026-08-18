// pages/a/[slug].js
// Publieke serveerroute voor gepubliceerde advertorials — de link die funnel builders
// in Funnelish plakken. Leest de finale HTML uit de databank en serveert hem rauw.
// Edits in de builder updaten dezelfde link automatisch (de databank is de bron).
// Geen login vereist: dit is een publieke advertorial-pagina.

import axios from "axios";
import zlib from "zlib";

const SHOPIFY_API_VERSION = "2025-01";
const CHUNKED = true;

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
  tokenCache = { token: response.data.access_token, expiresAt: Date.now() + (response.data.expires_in || 86399) * 1000 };
  return tokenCache.token;
}

async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const response = await axios.post(
    `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    { query, variables },
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 20000 }
  );
  if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
  return response.data.data;
}

async function readData(handle) {
  const data = await shopifyGraphql(
    `query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { field(key: "data") { value } } }`,
    { handle }
  );
  const raw = data?.metaobjectByHandle?.field?.value;
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function readLarge(base) {
  const first = await readData(`${base}-0`);
  if (!first) return "";
  let out = first.data || "";
  for (let i = 1; i < (first.total || 1); i++) {
    let part = await readData(`${base}-${i}`);
    // Eén hapering mag nooit stilletjes de halve pagina afkappen: één keer opnieuw
    if (!part || typeof part.data !== "string") {
      await new Promise((r) => setTimeout(r, 400));
      part = await readData(`${base}-${i}`);
    }
    if (!part || typeof part.data !== "string") throw new Error(`Storage incomplete: part ${i + 1} of ${first.total} missing`);
    out += part.data;
  }
  if (typeof first.len === "number" && out.length !== first.len) {
    throw new Error(`Storage incomplete: expected ${first.len} characters, got ${out.length}`);
  }
  // Nieuwe builds staan gecomprimeerd opgeslagen; oudere blijven gewoon werken
  return first.enc === "gzip" ? zlib.gunzipSync(Buffer.from(out, "base64")).toString("utf8") : out;
}

export async function getServerSideProps({ params, res }) {
  try {
    const slug = String(params.slug || "").replace(/[^a-z0-9\-]/g, "");
    const index = (await readData("advertorial-index")) || { builds: [] };
    const entry = index.builds.find((b) => b.slug === slug && b.status === "live");
    if (!entry) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.write("<!DOCTYPE html><html><body style=\"font-family:sans-serif;padding:40px;color:#334155\"><h2>Page not found</h2><p>This advertorial does not exist or is not published yet.</p></body></html>");
      res.end();
      return { props: {} };
    }
    let html = await readLarge(`advertorial-${entry.id}-fin`);
    // JJB Track automatisch injecteren: ad-parameters (fbclid, ad_id, ...) worden
    // vastgehouden en doorgegeven richting salespage + checkout (attributie)
    const tracker = '<script src="/jjb-track.js" async></script>';
    if (html) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tracker}</body>`) : html + tracker;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // 60s edge-cache: snel voor bezoekers, edits zijn binnen een minuut zichtbaar
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.write(html || "<!DOCTYPE html><html><body>Empty page</body></html>");
    res.end();
    return { props: {} };
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.write(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;color:#334155"><h2>Temporary error</h2><p>${String(e.message || "").slice(0, 200)}</p></body></html>`);
    res.end();
    return { props: {} };
  }
}

// De pagina rendert nooit client-side — getServerSideProps schrijft de HTML zelf weg
export default function Advertorial() {
  return null;
}
