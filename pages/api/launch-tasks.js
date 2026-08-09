// pages/api/launch-tasks.js
// Product Launching Department — task pipeline for funnel builders.
// Access: admin, Funnel Builder (full), Media Buyer (view + status + chat).
// Automation hooks (AI Translation, First Creative Batch headlines, Slack winner flow)
// are logged but not yet connected — phase 2.

import axios from "axios";
import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

const STATUSES = ["Task Start", "AI Translation", "Ready For Build", "In Production", "QA Check", "First Creative Batch", "Ready to launch", "Launched"];
const MARKETS = ["Italy", "France", "Israel"];
const COUNTRY_CODES = ["IT", "FR", "IL"];

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

// Zelfde interne sleutel als in salescopy.js — daarmee mag deze API de pipeline-queue aantrappen
const salescopyInternalKey = (taskId) => crypto.createHmac("sha256", SESSION_SECRET).update(`salescopy-queue:${taskId}`).digest("base64url");

// Server-side watchdog: het board pollt elke 10s zolang er iets in AI Translation staat.
// Is de zelf-kettende pipeline-keten van een taak gestorven (progress > 6 min stil terwijl
// de queue nog actief was), dan trappen we hem hier automatisch weer aan — geen Resume-klik nodig.
const PIPELINE_STALL_MS = 6 * 60 * 1000; // langste stap duurt max ~5 min (functielimiet 300s)
async function resumeStalledPipelines(req, tasks) {
  const stalled = (tasks || []).filter((t) => {
    const p = t.salesCopyProgress;
    return (
      t.status === "AI Translation" &&
      p && p.active && !p.delivered &&
      p.at && Date.now() - Date.parse(p.at) > PIPELINE_STALL_MS
    );
  });
  if (!stalled.length) return;
  const host = req.headers.host;
  if (!host) return;
  const proto = String(host).startsWith("localhost") ? "http" : "https";
  await Promise.all(
    stalled.slice(0, 3).map((t) =>
      axios
        .post(`${proto}://${host}/api/salescopy`, { action: "startQueue", taskId: t.id, internalKey: salescopyInternalKey(t.id) }, { timeout: 5000 })
        .catch(() => {}) // fire-and-forget: volgende board-poll probeert het gewoon opnieuw
    )
  );
}

/* ---------------- Shopify storage ---------------- */
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

// Verwijderde chatberichten: alleen de admin ziet de originele inhoud
function viewTasks(tasks, isAdmin) {
  if (isAdmin) return tasks;
  return (tasks || []).map((t) => ({
    ...t,
    activity: (t.activity || []).map((a) => (a.type === "chat" && a.deleted ? { ...a, text: "", attachment: null, replyTo: null } : a)),
  }));
}

// Eerstvolgende donderdag, einde van de dag (Europese avond)
function nextThursday() {
  const d = new Date();
  let diff = (4 - d.getUTCDay() + 7) % 7;
  if (diff === 0) diff = 7;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(21, 59, 0, 0);
  return d.toISOString();
}

/* ---------------- notifications helper ---------------- */
async function pushNotifications(items) {
  // items: [{ email, text, href }]
  if (!items.length) return;
  const store = (await readData("notifications")) || { items: [] };
  const at = new Date().toISOString();
  for (const n of items) {
    store.items.push({ id: uid(), email: n.email, text: n.text, href: n.href || "/product-launching", read: false, at });
  }
  // Bewaar maximaal de laatste 400 meldingen
  if (store.items.length > 400) store.items = store.items.slice(-400);
  await writeData("notifications", store);

  // Slack: dezelfde meldingen in het notificatiekanaal, met tag via het gekoppelde Slack member ID
  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const accounts = (await readData("accounts")) || { users: [] };
      const slackByEmail = {};
      for (const u of accounts.users || []) {
        if (u.slackId) slackByEmail[(u.email || "").toLowerCase()] = u.slackId;
      }
      const lines = items.map((n) => {
        const sid = slackByEmail[(n.email || "").toLowerCase()];
        return `${sid ? `<@${sid}> ` : ""}${n.text}`;
      });
      await axios.post(process.env.SLACK_WEBHOOK_URL, { text: lines.join("\n") }, { timeout: 8000 });
    } catch (e) {
      console.error("Slack notify error:", e.message);
    }
  }
}

/* ---------------- activity helper ---------------- */
function addLog(task, session, text) {
  task.activity = task.activity || [];
  task.activity.push({ id: uid(), type: "log", author: session.name, email: session.email, text, at: new Date().toISOString() });
}

/* ---------------- status-change side effects ---------------- */
async function applyStatusChange(task, newStatus, session, mediaBuyers, graphicDesigners = [], adminUser = null) {
  const notifications = [];
  task.status = newStatus;
  addLog(task, session, `changed status to "${newStatus}"`);

  if (newStatus === "AI Translation") {
    addLog(task, session, "⚙️ AI Translation started — the Sales Page Copy pipeline is running");
  }
  if (newStatus === "Ready For Build" && task.assigneeEmail && task.assigneeEmail !== session.email) {
    notifications.push({
      email: task.assigneeEmail,
      text: `"${task.productName}" is Ready For Build — you can start working on it`,
    });
  }
  if (newStatus === "QA Check" && session.email !== ADMIN_EMAIL) {
    notifications.push({
      email: ADMIN_EMAIL,
      text: `"${task.productName}" is ready for QA Check`,
    });
  }
  if (newStatus === "First Creative Batch") {
    addLog(task, session, "⚙️ First Creative Batch headlines queued — Stefan's Brain automation not connected yet (phase 2)");
    // Automation: automatisch een Graphic Designer-taak aanmaken in "Ready To Work"
    if (!task.designTaskId) {
      const at = new Date().toISOString();
      // Random graphic designer (bij precies 1 designer: die ene)
      const gd = graphicDesigners.length ? graphicDesigners[Math.floor(Math.random() * graphicDesigners.length)] : null;
      const designStore = (await readData("design-tasks")) || { tasks: [] };
      const d = {
        id: uid(),
        product: task.product || { id: "", title: task.productName || "New Product", image: "", variants: [] },
        deadline: nextThursday(),
        strategistEmail: adminUser?.email || "nielsleysen@gmail.com",
        strategistName: adminUser?.name || "Niels Leysen",
        assigneeEmail: gd?.email || "",
        assigneeName: gd?.name || "",
        status: "Ready To Work",
        angle: task.funnelAngle || "",
        advertorialLink: task.advertorialLink || "",
        market: task.marketCountry || "",
        countryCode: task.countryCode || "",
        gender: task.gender || "",
        ageRange: task.ageRange || "",
        batchType: "First Creative Batch",
        visualBriefing: "",
        iterationType: "",
        creativeCopy: task.firstCreativeBatch || "",
        frameioLink: "",
        finalOutputLink: "",
        launchedDate: null,
        activity: [
          { id: uid(), type: "log", author: session.name, email: session.email, text: `auto-created from Product Launching — "${task.productName}" reached First Creative Batch`, at },
          { id: uid(), type: "log", author: session.name, email: session.email, text: `changed status to "Ready To Work"`, at },
        ],
        createdAt: at,
        createdBy: session.name,
        sourceLaunchTaskId: task.id,
      };
      designStore.tasks.push(d);
      await writeData("design-tasks", designStore);
      task.designTaskId = d.id;
      addLog(task, session, `🎨 Graphic Designer task automatically created in Ready To Work${gd ? ` — assigned to ${gd.name}` : " — no active Graphic Designer account found"}`);
      if (gd && gd.email !== session.email) {
        notifications.push({
          email: gd.email,
          text: `First Creative Batch for "${task.productName}" is Ready To Work — deadline Thursday`,
          href: "/graphic-designer",
        });
      }
    }
  }
  // "Ready to launch" bij funnels: geen media buyer melding — Media Buying draait alleen op
  // creatives en designs uit de Video Editor en Graphic Designer tabbladen.
  if (newStatus === "Launched" && !task.launchedDate) {
    task.launchedDate = new Date().toISOString();
    addLog(task, session, "🚀 marked as Launched");
  }
  await pushNotifications(notifications);
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  const session = getSession(req);
  const roles = session?.roles || [];
  const isAdmin = !!session?.admin;
  const isFB = roles.includes("Funnel Builder");
  const isMB = roles.includes("Media Buyer");

  if (!session || !(isAdmin || isFB || isMB)) {
    return res.status(401).json({ success: false, error: "No access — Product Launching requires Funnel Builder or Media Buyer role" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const canEdit = isAdmin || isFB; // velden bewerken + aanmaken
    const canStatus = isAdmin || isFB || isMB;

    if (req.method === "GET") {
      const [store, accounts] = await Promise.all([readData("launch-tasks"), readData("accounts")]);
      await resumeStalledPipelines(req, store?.tasks || []);
      const users = (accounts?.users || []).filter((u) => u.status === "active");
      const funnelBuilders = users
        .filter((u) => (u.roles || []).includes("Funnel Builder"))
        .map((u) => ({ name: u.name, email: u.email }));
      const team = users.map((u) => ({ name: u.name, email: u.email }));
      return res.status(200).json({
        success: true,
        tasks: viewTasks(store?.tasks || [], isAdmin),
        funnelBuilders,
        team,
        me: { email: session.email, name: session.name, admin: isAdmin, canEdit, canStatus },
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { action, taskId, task: input, status, message, attachment, messageId, replyTo } = req.body || {};
    const store = (await readData("launch-tasks")) || { tasks: [] };
    const accounts = (await readData("accounts")) || { users: [] };
    const activeUsers = accounts.users.filter((u) => u.status === "active");
    const mediaBuyers = activeUsers.filter((u) => (u.roles || []).includes("Media Buyer")).map((u) => ({ name: u.name, email: u.email }));
    const graphicDesigners = activeUsers.filter((u) => (u.roles || []).includes("Graphic Designer")).map((u) => ({ name: u.name, email: u.email }));
    const adminUser = activeUsers.find((u) => (u.email || "").toLowerCase() === ADMIN_EMAIL) || { name: "Niels Leysen", email: ADMIN_EMAIL };

    const FIELDS = ["productName", "product", "deadline", "assigneeEmail", "assigneeName", "advertorialLink", "funnelWorkspaceLink", "marketCountry", "countryCode", "funnelAngle", "gender", "ageRange", "alibabaLink", "funnelishLink", "firstCreativeBatch", "readyForAI", "aiCopy", "productPackshot", "source"];

    /* --- create --- */
    if (action === "create") {
      if (!canEdit) return res.status(403).json({ success: false, error: "Only admin and Funnel Builders can create tasks" });
      if (!input?.productName?.trim()) return res.status(400).json({ success: false, error: "Product Name is required" });
      const t = {
        id: uid(),
        productName: "",
        product: null,
        deadline: "",
        assigneeEmail: "",
        assigneeName: "",
        status: STATUSES.includes(input.status) ? input.status : "Task Start",
        advertorialLink: "",
        funnelWorkspaceLink: "",
        marketCountry: "",
        countryCode: "",
        funnelAngle: "",
        gender: "",
        ageRange: "",
        alibabaLink: "",
        funnelishLink: "",
        firstCreativeBatch: "",
        readyForAI: "NO",
        aiCopy: "",
        launchedDate: null,
        activity: [],
        createdAt: new Date().toISOString(),
        createdBy: session.name,
      };
      for (const f of FIELDS) if (f in input) t[f] = input[f] || "";
      addLog(t, session, "created this task");
      const notifs = [];
      if (t.assigneeEmail && t.assigneeEmail !== session.email) {
        notifs.push({ email: t.assigneeEmail, text: `You've been assigned to "${t.productName}"` });
      }
      if (t.status !== "Task Start") {
        await applyStatusChange(t, t.status, session, mediaBuyers, graphicDesigners, adminUser);
      }
      store.tasks.push(t);
      await writeData("launch-tasks", store);
      await pushNotifications(notifs);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin), createdId: t.id });
    }

    /* --- refresh (alleen de takenlijst opnieuw ophalen) --- */
    if (action === "refresh") {
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });

    /* --- update fields --- */
    if (action === "update") {
      if (!canEdit) return res.status(403).json({ success: false, error: "Only admin and Funnel Builders can edit tasks" });
      const notifs = [];
      const changed = [];
      for (const f of FIELDS) {
        if (input && f in input && JSON.stringify(input[f]) !== JSON.stringify(task[f])) {
          task[f] = input[f];
          changed.push(f);
        }
      }
      // Shopify-product gekozen: productnaam automatisch overnemen
      if (changed.includes("product") && task.product?.title) task.productName = task.product.title;
      if (changed.includes("assigneeEmail") && task.assigneeEmail && task.assigneeEmail !== session.email) {
        notifs.push({ email: task.assigneeEmail, text: `You've been assigned to "${task.productName}"` });
      }
      if (changed.includes("readyForAI") && task.readyForAI === "YES") {
        addLog(task, session, "⚙️ Ready for AI Translation set to YES — automation not connected yet (phase 2)");
      }
      const logFields = changed.filter((f) => f !== "aiCopy");
      if (logFields.length) addLog(task, session, `updated ${logFields.join(", ")}`);
      await writeData("launch-tasks", store);
      await pushNotifications(notifs);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- status --- */
    if (action === "status") {
      if (!canStatus) return res.status(403).json({ success: false, error: "No permission to change status" });
      if (!STATUSES.includes(status)) return res.status(400).json({ success: false, error: "Invalid status" });
      await applyStatusChange(task, status, session, mediaBuyers, graphicDesigners, adminUser);
      await writeData("launch-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- chat (iedereen met toegang) --- */
    if (action === "chat") {
      const text = (message || "").trim().slice(0, 1000);
      // Bijlage (bestand of voicebericht) — alleen https-URLs van de upload-endpoint
      const att =
        attachment && typeof attachment.url === "string" && attachment.url.startsWith("https://")
          ? {
              url: attachment.url.slice(0, 600),
              name: String(attachment.name || "").slice(0, 120),
              mime: String(attachment.mime || "").slice(0, 80),
              kind: ["image", "audio", "file"].includes(attachment.kind) ? attachment.kind : "file",
              transcript: String(attachment.transcript || "").slice(0, 1200),
            }
          : null;
      if (!text && !att) return res.status(400).json({ success: false, error: "Empty message" });
      const reply =
        replyTo && typeof replyTo.id === "string"
          ? { id: String(replyTo.id).slice(0, 40), author: String(replyTo.author || "").slice(0, 80), text: String(replyTo.text || "").slice(0, 140) }
          : null;
      task.activity = task.activity || [];
      task.activity.push({ id: uid(), type: "chat", author: session.name, email: session.email, text, attachment: att, replyTo: reply, at: new Date().toISOString() });

      // @mentions: match op voornaam van actieve teamleden
      const notifs = [];
      for (const u of activeUsers) {
        if (u.email === session.email) continue;
        const first = (u.name || "").trim().split(/\s+/)[0];
        if (first && new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
          notifs.push({ email: u.email, text: `${session.name} mentioned you on "${task.productName}": "${text.slice(0, 80)}"` });
        }
      }
      await writeData("launch-tasks", store);
      await pushNotifications(notifs);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- chat bewerken (alleen eigen bericht; admin mag alles) --- */
    if (action === "chatEdit") {
      const entry = (task.activity || []).find((a) => a.id === messageId && a.type === "chat");
      if (!entry) return res.status(404).json({ success: false, error: "Message not found" });
      if (entry.email !== session.email && !isAdmin) return res.status(403).json({ success: false, error: "You can only edit your own messages" });
      const text = (message || "").trim().slice(0, 1000);
      if (!text) return res.status(400).json({ success: false, error: "Empty message" });
      entry.text = text;
      entry.edited = true;
      await writeData("launch-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- chat verwijderen (soft delete — admin blijft de inhoud zien) --- */
    if (action === "chatDelete") {
      const entry = (task.activity || []).find((a) => a.id === messageId && a.type === "chat");
      if (!entry) return res.status(404).json({ success: false, error: "Message not found" });
      if (entry.email !== session.email && !isAdmin) return res.status(403).json({ success: false, error: "You can only delete your own messages" });
      entry.deleted = true;
      await writeData("launch-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- duplicate (admin + funnel builders) --- */
    if (action === "duplicate") {
      if (!canEdit) return res.status(403).json({ success: false, error: "No permission to duplicate tasks" });
      const copy = {
        ...JSON.parse(JSON.stringify(task)),
        id: uid(),
        productName: task.productName ? `${task.productName} (Copy)` : "New Product",
        status: "Task Start",
        launchedDate: null,
        activity: [],
        createdAt: new Date().toISOString(),
        createdBy: session.name,
      };
      addLog(copy, session, `duplicated this task from "${task.productName}"`);
      store.tasks.push(copy);
      await writeData("launch-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin), createdId: copy.id });
    }

    /* --- delete (admin only) --- */
    if (action === "delete") {
      if (!isAdmin) return res.status(403).json({ success: false, error: "Only the administrator can delete tasks" });
      store.tasks = store.tasks.filter((t) => t.id !== taskId);
      await writeData("launch-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Launch tasks error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
