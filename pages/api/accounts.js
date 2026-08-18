// pages/api/accounts.js
// Account Management — alleen toegankelijk voor de admin (nielsleysen@gmail.com).
// GET: lijst van alle accounts.
// POST: status/rechten wijzigen, account verwijderen, of iemand UITNODIGEN.
//
// Uitnodigen: de admin geeft e-mail + naam + rollen op. Er wordt meteen een account
// aangemaakt met status "invited" en de rollen al toegekend. De persoon krijgt een
// e-mail met een uitnodigingslink; daar kiest hij alleen nog een wachtwoord en is
// hij direct binnen — met de juiste toegang. Geen goedkeuringsstap meer nodig.
// E-mail loopt via Resend (RESEND_API_KEY). Is die niet ingesteld of faalt hij,
// dan krijgt de admin de link te zien om zelf door te sturen.

import axios from "axios";
import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

const ROLES = ["Funnel Builder", "Creative Strategist", "Graphic Designer", "Store Manager", "Video Editor", "Media Buyer"];

/* ---------------- sessie check ---------------- */
function getSession(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)jjb_session=([^;]+)/);
  const token = match ? match[1] : null;
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

/* ---------------- uitnodigingen ---------------- */
const INVITE_DAYS = 14;

function signInvite(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(`invite.${body}`).digest("base64url");
  return `${body}.${sig}`;
}

function inviteUrlFor(req, user) {
  const token = signInvite({ uid: user.id, email: user.email, exp: Date.now() + INVITE_DAYS * 86400000 });
  const host = req.headers.host;
  const proto = /localhost|127\.0\.0\.1/.test(host) ? "http" : "https";
  return `${proto}://${host}/invite?token=${encodeURIComponent(token)}`;
}

// E-mail versturen via Resend (geen extra dependency — gewone REST-call).
// Geen key of fout? Dan false teruggeven; de admin krijgt dan de link te zien.
async function sendInviteEmail(user, url) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  const from = process.env.INVITE_FROM_EMAIL || "Just Jenny Operations <onboarding@resend.dev>";
  const roles = (user.roles || []).join(", ") || "team member";
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f8fa;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #eceef2;border-radius:16px;padding:36px 40px;">
        <tr><td style="font-size:30px;padding-bottom:10px;">🧭</td></tr>
        <tr><td style="font-size:20px;font-weight:700;color:#0f172a;padding-bottom:6px;">You've been invited to the Just Jenny Operations Centre</td></tr>
        <tr><td style="font-size:14px;color:#64748b;line-height:1.6;padding-bottom:22px;">
          Hi ${escapeHtml(user.name || "there")},<br><br>
          Your account has been created with the role <b style="color:#0f172a;">${escapeHtml(roles)}</b>.
          Click the button below to choose a password — after that you're straight in, with the right access already set up.
        </td></tr>
        <tr><td style="padding-bottom:22px;">
          <a href="${url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 28px;border-radius:10px;">Create my account →</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#94a3b8;line-height:1.6;border-top:1px solid #f1f5f9;padding-top:18px;">
          This invitation is valid for ${INVITE_DAYS} days. If the button doesn't work, copy this link:<br>
          <span style="color:#2563eb;word-break:break-all;">${url}</span>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
  try {
    await axios.post(
      "https://api.resend.com/emails",
      { from, to: [user.email], subject: "Your access to the Just Jenny Operations Centre", html },
      { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, timeout: 15000 }
    );
    return { sent: true };
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error?.message || e.message;
    console.error("Invite email error:", msg);
    return { sent: false, reason: String(msg).slice(0, 200) };
  }
}

const escapeHtml = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const session = getSession(req);
  if (!session || !session.admin) {
    return res.status(401).json({ success: false, error: "Only the administrator has access." });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const accounts = await readAccounts();
      // Wachtwoord-hashes nooit naar de client sturen
      const users = accounts.users.map(({ passwordHash, salt, ...u }) => u);
      return res.status(200).json({ success: true, users });
    }

    if (req.method === "POST") {
      const { action, userId, updates, remove } = req.body || {};

      /* --- iemand uitnodigen: account meteen aanmaken mét rollen --- */
      if (action === "invite") {
        const email = String(req.body.email || "").trim().toLowerCase();
        const name = String(req.body.name || "").trim();
        const roles = Array.isArray(req.body.roles) ? req.body.roles.filter((r) => ROLES.includes(r)) : [];
        if (!email || !email.includes("@")) return res.status(400).json({ success: false, error: "Enter a valid email address" });

        const accounts = await readAccounts();
        const existing = accounts.users.find((u) => u.email === email);
        if (existing && existing.status !== "invited") {
          return res.status(400).json({ success: false, error: "An account with this email address already exists" });
        }

        let user = existing;
        if (user) {
          // Nog niet geaccepteerde uitnodiging → naam/rollen bijwerken en opnieuw sturen
          if (name) user.name = name;
          user.roles = roles;
          user.invitedAt = new Date().toISOString();
        } else {
          user = {
            id: crypto.randomBytes(8).toString("hex"),
            email,
            name: name || email.split("@")[0],
            roles,
            status: "invited",
            createdAt: new Date().toISOString(),
            invitedAt: new Date().toISOString(),
            invitedBy: session.email,
          };
          accounts.users.push(user);
        }
        await writeAccounts(accounts);

        const url = inviteUrlFor(req, user);
        const mail = await sendInviteEmail(user, url);
        const users = accounts.users.map(({ passwordHash, salt, ...u }) => u);
        return res.status(200).json({ success: true, users, inviteUrl: url, emailed: mail.sent, emailError: mail.reason || "" });
      }

      /* --- uitnodiging opnieuw versturen / link ophalen --- */
      if (action === "resendInvite") {
        const accounts = await readAccounts();
        const user = accounts.users.find((u) => u.id === userId);
        if (!user) return res.status(404).json({ success: false, error: "Account not found" });
        if (user.status !== "invited") return res.status(400).json({ success: false, error: "This account is already active" });
        user.invitedAt = new Date().toISOString();
        await writeAccounts(accounts);
        const url = inviteUrlFor(req, user);
        const mail = await sendInviteEmail(user, url);
        const users = accounts.users.map(({ passwordHash, salt, ...u }) => u);
        return res.status(200).json({ success: true, users, inviteUrl: url, emailed: mail.sent, emailError: mail.reason || "" });
      }

      if (!userId) return res.status(400).json({ success: false, error: "No userId" });

      const accounts = await readAccounts();
      const user = accounts.users.find((u) => u.id === userId);
      if (!user) return res.status(404).json({ success: false, error: "Account not found" });

      // De admin zelf kan niet verwijderd of afgezwakt worden
      if (user.email === ADMIN_EMAIL && (remove || (updates && updates.status && updates.status !== "active"))) {
        return res.status(400).json({ success: false, error: "The admin account cannot be modified or removed." });
      }

      if (remove) {
        accounts.users = accounts.users.filter((u) => u.id !== userId);
      } else if (updates) {
        if ("status" in updates) user.status = updates.status;
        if ("name" in updates) user.name = updates.name;
        if ("slackId" in updates) {
          // Slack member ID (bv. U0123ABCD) — <@...> of @ eromheen wordt weggehaald
          user.slackId = String(updates.slackId || "").replace(/[<@>\s]/g, "").slice(0, 30);
        }
        if ("roles" in updates && Array.isArray(updates.roles)) {
          user.roles = updates.roles.filter((r) => ROLES.includes(r));
        }
      }

      await writeAccounts(accounts);
      const users = accounts.users.map(({ passwordHash, salt, ...u }) => u);
      return res.status(200).json({ success: true, users });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Accounts error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
