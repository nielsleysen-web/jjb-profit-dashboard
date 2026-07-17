// pages/api/auth.js
// Operations Centre — registratie, login, logout en sessie-info.
// Accounts worden opgeslagen als metaobject in Shopify (type jjb_dashboard_data, handle "accounts").
// Sessies: HMAC-getekende token in een HttpOnly cookie (12 uur geldig).

import axios from "axios";
import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
const SESSION_HOURS = 12;

/* ---------------- Shopify token ---------------- */
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

/* ---------------- accounts opslag (Shopify metaobject) ---------------- */
async function shopifyGraphql(query, variables) {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const token = await getShopifyToken(storeUrl);
  const response = await axios.post(
    `https://${storeUrl}/admin/api/2025-01/graphql.json`,
    { query, variables },
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 15000 }
  );
  if (response.data.errors) throw new Error(JSON.stringify(response.data.errors));
  return response.data.data;
}

async function readAccounts() {
  const data = await shopifyGraphql(`
    query { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: "accounts" }) { field(key: "data") { value } } }
  `);
  const raw = data?.metaobjectByHandle?.field?.value;
  try {
    return raw ? JSON.parse(raw) : { users: [] };
  } catch {
    return { users: [] };
  }
}

async function writeAccounts(accounts) {
  const data = await shopifyGraphql(
    `mutation Save($value: String!) {
      metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: "accounts" }, metaobject: { fields: [{ key: "data", value: $value }] }) {
        metaobject { id }
        userErrors { message }
      }
    }`,
    { value: JSON.stringify(accounts) }
  );
  const errs = data?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

/* ---------------- wachtwoord & sessies ---------------- */
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
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

function getSessionFromReq(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  return verifySession(match ? match[1] : null);
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `jjb_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_HOURS * 3600}`
  );
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const action = req.query.action || (req.body && req.body.action) || "";
  res.setHeader("Cache-Control", "no-store");

  try {
    /* --- sessie-info --- */
    if (req.method === "GET" && action === "me") {
      const session = getSessionFromReq(req);
      if (!session) return res.status(401).json({ success: false });
      return res.status(200).json({ success: true, user: session });
    }

    /* --- uitloggen --- */
    if (action === "logout") {
      res.setHeader("Set-Cookie", "jjb_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0");
      return res.status(200).json({ success: true });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { email: rawEmail, name, password } = req.body || {};
    const email = (rawEmail || "").trim().toLowerCase();

    /* --- registreren --- */
    if (action === "register") {
      if (!email || !email.includes("@") || !password || password.length < 8) {
        return res.status(400).json({ success: false, error: "Enter a valid email address and a password of at least 8 characters." });
      }
      const accounts = await readAccounts();
      if (accounts.users.some((u) => u.email === email)) {
        return res.status(400).json({ success: false, error: "An account with this email address already exists." });
      }
      const isAdmin = email === ADMIN_EMAIL;
      const salt = crypto.randomBytes(16).toString("hex");
      const user = {
        id: crypto.randomBytes(8).toString("hex"),
        email,
        name: (name || "").trim() || email.split("@")[0],
        salt,
        passwordHash: hashPassword(password, salt),
        status: isAdmin ? "active" : "pending",
        finance: isAdmin,
        strategy: isAdmin,
        marketing: isAdmin,
        createdAt: new Date().toISOString(),
      };
      accounts.users.push(user);
      await writeAccounts(accounts);

      if (isAdmin) {
        const token = signSession({
          email,
          name: user.name,
          admin: true,
          finance: true,
          strategy: true,
          marketing: true,
          exp: Date.now() + SESSION_HOURS * 3600000,
        });
        setSessionCookie(res, token);
        return res.status(200).json({ success: true, user: { email, name: user.name, admin: true, finance: true, strategy: true, marketing: true } });
      }
      return res.status(200).json({ success: true, pending: true });
    }

    /* --- inloggen --- */
    if (action === "login") {
      const accounts = await readAccounts();
      const user = accounts.users.find((u) => u.email === email);
      if (!user || user.passwordHash !== hashPassword(password || "", user.salt)) {
        return res.status(401).json({ success: false, error: "Incorrect email address or password." });
      }
      if (user.status === "pending") {
        return res.status(403).json({ success: false, error: "Your account is awaiting approval by the administrator." });
      }
      if (user.status === "disabled") {
        return res.status(403).json({ success: false, error: "Your access has been revoked. Contact the administrator." });
      }
      const isAdmin = email === ADMIN_EMAIL;
      const payload = {
        email,
        name: user.name,
        admin: isAdmin,
        finance: isAdmin || !!user.finance,
        strategy: isAdmin || !!user.strategy,
        marketing: isAdmin || !!user.marketing,
        exp: Date.now() + SESSION_HOURS * 3600000,
      };
      setSessionCookie(res, signSession(payload));
      return res.status(200).json({ success: true, user: payload });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Auth error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
