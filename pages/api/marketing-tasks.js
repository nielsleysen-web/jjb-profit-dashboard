// pages/api/marketing-tasks.js
// Marketing workflow — tasks for editors & graphic designers.
// Admin: create/edit/delete everything. Marketing members: status, Frame.io link, chat.
// Storage: Shopify metaobject (type jjb_dashboard_data, handle "marketing-tasks").

import axios from "axios";
import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

/* ---------------- session check ---------------- */
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
    { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: 15000 }
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

async function writeData(handle, value) {
  const data = await shopifyGraphql(
    `mutation Save($handle: String!, $value: String!) {
      metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: $handle }, metaobject: { fields: [{ key: "data", value: $value }] }) {
        metaobject { id }
        userErrors { message }
      }
    }`,
    { handle, value: JSON.stringify(value) }
  );
  const errs = data?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

const uid = () => crypto.randomBytes(8).toString("hex");

const STATUSES = ["Ready to work", "In production", "QA Check", "Ready to launch", "Launched"];
const FORMATS = ["VSL", "UGC", "3D", "Single image", "Before & After", "Swipe"];
const TYPES = ["Net New", "Iteration"];

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const session = getSession(req);
  if (!session || !(session.marketing || session.admin)) {
    return res.status(401).json({ success: false, error: "No access — Marketing permission required" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const [store, accounts] = await Promise.all([
        readData("marketing-tasks"),
        readData("accounts"),
      ]);
      const tasks = store?.tasks || [];
      const team = (accounts?.users || [])
        .filter((u) => u.status === "active")
        .map((u) => ({ name: u.name, email: u.email }));
      return res.status(200).json({
        success: true,
        tasks,
        team,
        me: { email: session.email, name: session.name, admin: !!session.admin },
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { action, taskId, task: taskInput, status, frameioLink, message } = req.body || {};
    const store = (await readData("marketing-tasks")) || { tasks: [] };
    const isAdmin = !!session.admin;

    /* --- create (admin only) --- */
    if (action === "create") {
      if (!isAdmin) return res.status(403).json({ success: false, error: "Only the administrator can create tasks." });
      if (!taskInput?.product?.title) return res.status(400).json({ success: false, error: "Product is required" });
      const t = {
        id: uid(),
        product: { title: taskInput.product.title, image: taskInput.product.image || null },
        angle: taskInput.angle || "",
        landingPage: taskInput.landingPage || "",
        briefingLink: taskInput.briefingLink || "",
        scriptLink: taskInput.scriptLink || "",
        deadline: taskInput.deadline || "",
        spocEmail: taskInput.spocEmail || "",
        spocName: taskInput.spocName || "",
        type: TYPES.includes(taskInput.type) ? taskInput.type : "Net New",
        format: FORMATS.includes(taskInput.format) ? taskInput.format : "UGC",
        frameioLink: taskInput.frameioLink || "",
        status: STATUSES.includes(taskInput.status) ? taskInput.status : "Ready to work",
        launchedDate: null,
        chat: [],
        createdAt: new Date().toISOString(),
      };
      if (t.status === "Launched") t.launchedDate = new Date().toISOString();
      store.tasks.push(t);
      await writeData("marketing-tasks", store);
      return res.status(200).json({ success: true, tasks: store.tasks });
    }

    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });

    /* --- full edit (admin only) --- */
    if (action === "update") {
      if (!isAdmin) return res.status(403).json({ success: false, error: "Only the administrator can edit tasks." });
      const allowed = ["product", "angle", "landingPage", "briefingLink", "scriptLink", "deadline", "spocEmail", "spocName", "type", "format", "frameioLink", "status"];
      for (const key of allowed) {
        if (taskInput && key in taskInput) task[key] = taskInput[key];
      }
      if (task.status === "Launched" && !task.launchedDate) task.launchedDate = new Date().toISOString();
      await writeData("marketing-tasks", store);
      return res.status(200).json({ success: true, tasks: store.tasks });
    }

    /* --- delete (admin only) --- */
    if (action === "delete") {
      if (!isAdmin) return res.status(403).json({ success: false, error: "Only the administrator can delete tasks." });
      store.tasks = store.tasks.filter((t) => t.id !== taskId);
      await writeData("marketing-tasks", store);
      return res.status(200).json({ success: true, tasks: store.tasks });
    }

    /* --- status change (all marketing members) --- */
    if (action === "status") {
      if (!STATUSES.includes(status)) return res.status(400).json({ success: false, error: "Invalid status" });
      task.status = status;
      if (status === "Launched" && !task.launchedDate) task.launchedDate = new Date().toISOString();
      await writeData("marketing-tasks", store);
      return res.status(200).json({ success: true, tasks: store.tasks });
    }

    /* --- frame.io link (all marketing members) --- */
    if (action === "frameio") {
      task.frameioLink = frameioLink || "";
      await writeData("marketing-tasks", store);
      return res.status(200).json({ success: true, tasks: store.tasks });
    }

    /* --- chat message (all marketing members) --- */
    if (action === "chat") {
      const text = (message || "").trim();
      if (!text) return res.status(400).json({ success: false, error: "Empty message" });
      task.chat = task.chat || [];
      task.chat.push({
        id: uid(),
        author: session.name,
        email: session.email,
        text: text.slice(0, 1000),
        at: new Date().toISOString(),
      });
      await writeData("marketing-tasks", store);
      return res.status(200).json({ success: true, tasks: store.tasks });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Marketing tasks error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
