// pages/api/creative-tasks.js
// Marketing Creatives — Video Editor task pipeline.
// Access: admin & Creative Strategist (full), Video Editor (status, output links, chat),
// Media Buyer (view, status, chat — for the Ready To Launch worktable),
// Graphic Designer (view, chat).

import axios from "axios";
import crypto from "crypto";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";

const STATUSES = ["Task Start", "Ready To Work", "In Production", "QA Check", "Revisions", "Ready to launch", "Launched"];
const MARKETS = ["Italy", "France", "Israel"];
const CODES = ["IT", "FR", "IL"];
const GENDERS = ["Male", "Female"];
const AGE_RANGES = ["18-25", "25-40", "40-55", "55+"];
const TYPES = ["Net New", "Iteration"];
const VIDEO_ITERATIONS = ["Hood", "Lead", "A-roll", "B-roll", "Video format"];
const VIDEO_FORMATS = ["Short Form", "VSL", "UGC Yap", "Podcast Yap", "3D Animations"];
const AROLL_OPTIONS = ["Existing", "Net New", "Keep Current"];

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

/* ---------------- notifications ---------------- */
async function pushNotifications(items) {
  if (!items.length) return;
  const store = (await readData("notifications")) || { items: [] };
  const at = new Date().toISOString();
  for (const n of items) {
    store.items.push({ id: uid(), email: n.email, text: n.text, href: n.href || "/video-editor", read: false, at });
  }
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

function addLog(task, session, text) {
  task.activity = task.activity || [];
  task.activity.push({ id: uid(), type: "log", author: session.name, email: session.email, text, at: new Date().toISOString() });
}

/* ---------------- status side effects ---------------- */
async function applyStatusChange(task, newStatus, session, mediaBuyers) {
  const notifications = [];
  task.status = newStatus;
  addLog(task, session, `changed status to "${newStatus}"`);

  const productName = task.product?.title || "creative task";

  if (newStatus === "Ready To Work" && task.assigneeEmail && task.assigneeEmail !== session.email) {
    notifications.push({ email: task.assigneeEmail, text: `"${productName}" is Ready To Work — you can start editing` });
  }
  if (newStatus === "QA Check") {
    // Zowel de admin als de verantwoordelijke Creative Strategist krijgen de QA-melding
    if (session.email !== ADMIN_EMAIL) {
      notifications.push({ email: ADMIN_EMAIL, text: `Video for "${productName}" is ready for QA Check` });
    }
    if (task.strategistEmail && task.strategistEmail !== session.email && task.strategistEmail !== ADMIN_EMAIL) {
      notifications.push({ email: task.strategistEmail, text: `Video for "${productName}" is ready for your QA Check` });
    }
  }
  if (newStatus === "Revisions" && task.assigneeEmail && task.assigneeEmail !== session.email) {
    notifications.push({ email: task.assigneeEmail, text: `"${productName}" needs revisions — check the feedback` });
  }
  if (newStatus === "Ready to launch") {
    for (const mb of mediaBuyers) {
      if (mb.email !== session.email) {
        notifications.push({ email: mb.email, text: `Creative for "${productName}" is Ready to launch`, href: "/ready-to-launch" });
      }
    }
  }
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
  const isCS = roles.includes("Creative Strategist");
  const isVE = roles.includes("Video Editor");
  const isMB = roles.includes("Media Buyer");
  const isGD = roles.includes("Graphic Designer");

  if (!session || !(isAdmin || isCS || isVE || isMB || isGD)) {
    return res.status(401).json({ success: false, error: "No access — Marketing Creatives requires a creative role" });
  }
  res.setHeader("Cache-Control", "no-store");

  try {
    const canEdit = isAdmin || isCS;
    const canStatus = isAdmin || isCS || isVE || isMB;
    const canOutput = isAdmin || isCS || isVE;

    if (req.method === "GET") {
      const [store, accounts] = await Promise.all([readData("creative-tasks"), readData("accounts")]);
      const users = (accounts?.users || []).filter((u) => u.status === "active");
      // Creative strategists: rol CS + de admin zelf
      const creativeStrategists = users
        .filter((u) => (u.roles || []).includes("Creative Strategist") || u.email === ADMIN_EMAIL)
        .map((u) => ({ name: u.name, email: u.email }));
      const videoEditors = users
        .filter((u) => (u.roles || []).includes("Video Editor"))
        .map((u) => ({ name: u.name, email: u.email }));
      const team = users.map((u) => ({ name: u.name, email: u.email }));
      return res.status(200).json({
        success: true,
        tasks: viewTasks(store?.tasks || [], isAdmin),
        creativeStrategists,
        videoEditors,
        team,
        me: { email: session.email, name: session.name, admin: isAdmin, canEdit, canStatus, canOutput },
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { action, taskId, task: input, status, message, attachment, messageId, replyTo } = req.body || {};
    const store = (await readData("creative-tasks")) || { tasks: [] };
    const accounts = (await readData("accounts")) || { users: [] };
    const activeUsers = accounts.users.filter((u) => u.status === "active");
    const mediaBuyers = activeUsers.filter((u) => (u.roles || []).includes("Media Buyer")).map((u) => ({ name: u.name, email: u.email }));

    const FIELDS = [
      "product", "scriptLink", "deadline", "strategistEmail", "strategistName", "assigneeEmail", "assigneeName",
      "angle", "advertorialLink", "market", "countryCode", "gender", "ageRange", "type",
      "videoIteration", "referenceAd", "inspirationLink", "videoFormat", "aRoll", "aRollAvatarId", "aRollAvatarName",
      "aRollLink", "voiceId", "voiceName", "subtitles", "frameioLink", "finalOutputLink",
    ];
    const OUTPUT_FIELDS = ["frameioLink", "finalOutputLink"];

    /* --- create (admin + creative strategist) --- */
    if (action === "create") {
      if (!canEdit) return res.status(403).json({ success: false, error: "Only admin and Creative Strategists can create tasks" });
      const t = {
        id: uid(),
        product: null,
        scriptLink: "",
        deadline: "",
        strategistEmail: "",
        strategistName: "",
        assigneeEmail: "",
        assigneeName: "",
        status: STATUSES.includes(input?.status) ? input.status : "Task Start",
        angle: "",
        advertorialLink: "",
        market: "",
        countryCode: "",
        gender: "",
        ageRange: "",
        type: "Net New",
        videoIteration: "",
        inspirationLink: "",
        videoFormat: "",
        aRoll: "",
        aRollAvatarId: "",
        aRollAvatarName: "",
        aRollLink: "",
        voiceId: "",
        voiceName: "",
        subtitles: "",
        frameioLink: "",
        finalOutputLink: "",
        launchedDate: null,
        activity: [],
        createdAt: new Date().toISOString(),
        createdBy: session.name,
      };
      for (const f of FIELDS) if (input && f in input) t[f] = input[f] ?? "";
      addLog(t, session, "created this task");
      const notifs = [];
      if (t.assigneeEmail && t.assigneeEmail !== session.email) {
        notifs.push({ email: t.assigneeEmail, text: `You've been assigned to a new video task${t.product?.title ? ` for "${t.product.title}"` : ""}` });
      }
      if (t.status !== "Task Start") {
        await applyStatusChange(t, t.status, session, mediaBuyers);
      }
      store.tasks.push(t);
      await writeData("creative-tasks", store);
      await pushNotifications(notifs);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin), createdId: t.id });
    }

    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });

    /* --- update fields --- */
    if (action === "update") {
      // Video editors mogen alleen de output-links bijwerken
      const patchKeys = Object.keys(input || {});
      const onlyOutput = patchKeys.every((k) => OUTPUT_FIELDS.includes(k));
      if (!canEdit && !(canOutput && onlyOutput)) {
        return res.status(403).json({ success: false, error: "No permission to edit these fields" });
      }
      const notifs = [];
      const changed = [];
      for (const f of FIELDS) {
        if (input && f in input && JSON.stringify(input[f]) !== JSON.stringify(task[f])) {
          task[f] = input[f];
          changed.push(f);
        }
      }
      if (changed.includes("assigneeEmail") && task.assigneeEmail && task.assigneeEmail !== session.email) {
        notifs.push({ email: task.assigneeEmail, text: `You've been assigned to the video task for "${task.product?.title || "a product"}"` });
      }
      if (changed.length) addLog(task, session, `updated ${changed.join(", ")}`);
      await writeData("creative-tasks", store);
      await pushNotifications(notifs);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- status --- */
    if (action === "status") {
      if (!canStatus) return res.status(403).json({ success: false, error: "No permission to change status" });
      if (!STATUSES.includes(status)) return res.status(400).json({ success: false, error: "Invalid status" });
      await applyStatusChange(task, status, session, mediaBuyers);
      await writeData("creative-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- chat --- */
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

      const notifs = [];
      for (const u of activeUsers) {
        if (u.email === session.email) continue;
        const first = (u.name || "").trim().split(/\s+/)[0];
        if (first && new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
          notifs.push({ email: u.email, text: `${session.name} mentioned you on "${task.product?.title || "a video task"}": "${text.slice(0, 80)}"` });
        }
      }
      await writeData("creative-tasks", store);
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
      await writeData("creative-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- chat verwijderen (soft delete — admin blijft de inhoud zien) --- */
    if (action === "chatDelete") {
      const entry = (task.activity || []).find((a) => a.id === messageId && a.type === "chat");
      if (!entry) return res.status(404).json({ success: false, error: "Message not found" });
      if (entry.email !== session.email && !isAdmin) return res.status(403).json({ success: false, error: "You can only delete your own messages" });
      entry.deleted = true;
      await writeData("creative-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    /* --- duplicate (admin + creative strategist) --- */
    if (action === "duplicate") {
      if (!canEdit) return res.status(403).json({ success: false, error: "No permission to duplicate tasks" });
      const copy = {
        ...JSON.parse(JSON.stringify(task)),
        id: uid(),
        status: "Task Start",
        launchedDate: null,
        frameioLink: "",
        finalOutputLink: "",
        activity: [],
        createdAt: new Date().toISOString(),
        createdBy: session.name,
      };
      addLog(copy, session, `duplicated this task from "${task.product?.title || "a video task"}"`);
      store.tasks.push(copy);
      await writeData("creative-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin), createdId: copy.id });
    }

    /* --- delete (admin + creative strategist) --- */
    if (action === "delete") {
      if (!canEdit) return res.status(403).json({ success: false, error: "Only admin and Creative Strategists can delete tasks" });
      store.tasks = store.tasks.filter((t) => t.id !== taskId);
      await writeData("creative-tasks", store);
      return res.status(200).json({ success: true, tasks: viewTasks(store.tasks, isAdmin) });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("Creative tasks error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
