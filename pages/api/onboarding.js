// pages/api/onboarding.js — Onboarding Courses (course for new video editors, graphic designers and creative strategists).
//
// Course = modules → lessons (Loom video + text + resource links). Stored as JSON in the Shopify metaobject
// jjb_dashboard_data / handle "onboarding_course" (same storage as /api/assets). Progress per person in
// handle "onboarding_progress": { [email]: { name, done: { [lessonId]: iso }, last: iso } }.
//
// Access: admin + roles Video Editor, Graphic Designer, Creative Strategist.
//   GET                          → { course, progress (own), isAdmin, team? (admin only) }
//   POST { action: "progress", lessonId, done }   → mark a lesson (un)done for yourself
//   POST { action: "saveCourse", course }         → admin only: replace the whole course (modules + lessons)
// A module/lesson can be limited to certain roles (roles: [] = everyone in the course).
// lesson.section = topic: in the module sidebar a divider with the topic name starts wherever the topic changes.

import crypto from "crypto";
import { shopifyGraphql } from "../../lib/shopify-admin";
import { getDashboardSession } from "../../lib/dashboard-session";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "nielsleysen@gmail.com").toLowerCase();
export const COURSE_ROLES = ["Video Editor", "Graphic Designer", "Creative Strategist"];
const uid = () => crypto.randomBytes(6).toString("hex");

async function readData(handle) {
  const data = await shopifyGraphql(
    `query Get($handle: String!) { metaobjectByHandle(handle: { type: "jjb_dashboard_data", handle: $handle }) { field(key: "data") { value } } }`,
    { handle }
  );
  const raw = data?.metaobjectByHandle?.field?.value;
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function writeData(handle, value) {
  const data = await shopifyGraphql(
    `mutation Save($handle: String!, $value: String!) {
      metaobjectUpsert(handle: { type: "jjb_dashboard_data", handle: $handle }, metaobject: { fields: [{ key: "data", value: $value }] }) {
        metaobject { id } userErrors { message }
      }
    }`,
    { handle, value: JSON.stringify(value) }
  );
  const errs = data?.metaobjectUpsert?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e) => e.message).join(", "));
}

// Starting structure — the admin replaces the Loom links and texts in the page (Edit course)
const lesson = (title, description = "") => ({ id: uid(), title, section: "", description, loom: "", duration: "", resources: [], roles: [] });
const SEED = () => ({
  title: "Onboarding Courses",
  intro: "Welcome to Just Jenny. Work through these modules in order — each lesson is a short Loom. Mark a lesson as done when you have watched it and applied it.",
  modules: [
    { id: uid(), title: "1 · Welcome to Just Jenny", description: "Who we are, how we work and what we expect from you.", roles: [], lessons: [lesson("Welcome & how we work"), lesson("Our products and customers"), lesson("Your first week")] },
    { id: uid(), title: "2 · Tools & workflow", description: "The Operations Centre, briefs, deadlines and delivery.", roles: [], lessons: [lesson("The Operations Centre tour"), lesson("How a brief reaches you"), lesson("Delivering files and naming")] },
    { id: uid(), title: "3 · What makes a winning ad", description: "Hooks, angles, ICPs and what the data tells us.", roles: [], lessons: [lesson("Hooks and the first 3 seconds"), lesson("Angles × ICPs"), lesson("Reading the Creative Heatmap")] },
    { id: uid(), title: "4 · Video editing standards", description: "For video editors.", roles: ["Video Editor"], lessons: [lesson("Format, length and pacing"), lesson("Captions and voiceover"), lesson("Common mistakes")] },
    { id: uid(), title: "5 · Graphic design standards", description: "For graphic designers.", roles: ["Graphic Designer"], lessons: [lesson("Image ad formats"), lesson("Headlines on images"), lesson("Sales page images")] },
    { id: uid(), title: "6 · Feedback & quality check", description: "How we review your work and how to get approved faster.", roles: [], lessons: [lesson("The review process"), lesson("Checklist before you deliver")] },
  ],
});

// Loom share/embed link → embed URL (also accepts a bare video id)
export function loomEmbed(url) {
  const m = String(url || "").match(/loom\.com\/(?:share|embed)\/([a-f0-9]{16,})/i) || String(url || "").match(/^([a-f0-9]{24,})$/i);
  return m ? `https://www.loom.com/embed/${m[1]}` : null;
}

const str = (v, n) => String(v ?? "").trim().slice(0, n);
const cleanRoles = (r) => (Array.isArray(r) ? r.filter((x) => COURSE_ROLES.includes(x)) : []);
function cleanCourse(c) {
  const modules = (Array.isArray(c?.modules) ? c.modules : []).slice(0, 40).map((m) => ({
    id: /^[a-f0-9]{6,24}$/.test(m?.id) ? m.id : uid(),
    title: str(m?.title, 120) || "Untitled module",
    description: str(m?.description, 400),
    cover: /^https:\/\//i.test(str(m?.cover, 600)) ? str(m?.cover, 600) : "",
    roles: cleanRoles(m?.roles),
    lessons: (Array.isArray(m?.lessons) ? m.lessons : []).slice(0, 60).map((l) => ({
      id: /^[a-f0-9]{6,24}$/.test(l?.id) ? l.id : uid(),
      title: str(l?.title, 140) || "Untitled lesson",
      section: str(l?.section, 80),
      description: str(l?.description, 4000),
      loom: str(l?.loom, 300),
      duration: str(l?.duration, 20),
      roles: cleanRoles(l?.roles),
      resources: (Array.isArray(l?.resources) ? l.resources : []).slice(0, 12)
        .map((x) => ({ label: str(x?.label, 80), url: str(x?.url, 600) }))
        .filter((x) => x.label && (/^https?:\/\//i.test(x.url) || x.url.startsWith("/"))),
    })),
  }));
  return { title: str(c?.title, 80) || "Onboarding Courses", intro: str(c?.intro, 1200), modules };
}

// What one person may see: modules/lessons without roles are for everyone; otherwise one of their roles must match
function forRoles(course, roles, isAdmin) {
  if (isAdmin) return course;
  const ok = (r) => !r?.length || r.some((x) => roles.includes(x));
  return { ...course, modules: course.modules.filter((m) => ok(m.roles)).map((m) => ({ ...m, lessons: m.lessons.filter((l) => ok(l.roles)) })).filter((m) => m.lessons.length) };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const s = getDashboardSession(req);
  if (!s) return res.status(401).json({ success: false, error: "Not logged in" });
  const email = String(s.email || "").toLowerCase();
  const isAdmin = !!s.admin || email === ADMIN_EMAIL;
  const roles = Array.isArray(s.roles) ? s.roles : [];
  if (!isAdmin && !roles.some((r) => COURSE_ROLES.includes(r))) return res.status(403).json({ success: false, error: "No access" });

  try {
    let course = await readData("onboarding_course");
    if (!course || !Array.isArray(course.modules)) { course = SEED(); await writeData("onboarding_course", course); }
    const progressAll = (await readData("onboarding_progress")) || {};

    if (req.method === "GET") {
      const mine = forRoles(course, roles, isAdmin);
      const out = { success: true, isAdmin, roles: COURSE_ROLES, course: mine, progress: progressAll[email]?.done || {} };
      if (isAdmin) {
        // Team overview: everyone with a course role (also those who haven't started yet) + anyone with progress.
        // Per person how many of THEIR lessons are done and which lesson is next.
        const accounts = (await readData("accounts")) || { users: [] };
        const people = {};
        for (const u of accounts.users || []) {
          const e = String(u.email || "").toLowerCase();
          const r = Array.isArray(u.roles) ? u.roles : [];
          if (!e || e === ADMIN_EMAIL || u.status === "disabled" || !r.some((x) => COURSE_ROLES.includes(x))) continue;
          people[e] = { name: u.name || e, roles: r, status: u.status || "active" };
        }
        for (const [e, p] of Object.entries(progressAll)) {
          const acc = (accounts.users || []).find((u) => String(u.email || "").toLowerCase() === e);
          if (acc?.status === "disabled") continue;
          people[e] = { name: acc?.name || p.name || e, roles: acc?.roles?.length ? acc.roles : p.roles || [], status: acc?.status || "active", ...people[e] };
        }
        out.team = Object.entries(people).map(([e, a]) => {
          const p = progressAll[e] || {};
          const lessons = forRoles(course, a.roles, e === ADMIN_EMAIL).modules.flatMap((m) => m.lessons);
          const done = lessons.filter((l) => p.done?.[l.id]).length;
          const next = lessons.find((l) => !p.done?.[l.id]);
          return { email: e, name: a.name, roles: a.roles, status: a.status, done, total: lessons.length, next: next ? next.title : null, last: p.last || null };
        }).sort((a, b) => (b.last ? 1 : 0) - (a.last ? 1 : 0) || String(b.last || "").localeCompare(String(a.last || "")) || a.name.localeCompare(b.name));
      }
      return res.status(200).json(out);
    }

    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
    const b = req.body || {};

    if (b.action === "progress") {
      const lessonId = String(b.lessonId || "");
      if (!course.modules.some((m) => m.lessons.some((l) => l.id === lessonId))) return res.status(400).json({ success: false, error: "Unknown lesson" });
      const p = progressAll[email] || { done: {} };
      p.name = s.name || p.name || email;
      p.roles = roles;
      p.done = p.done || {};
      if (b.done) p.done[lessonId] = new Date().toISOString(); else delete p.done[lessonId];
      p.last = new Date().toISOString();
      progressAll[email] = p;
      await writeData("onboarding_progress", progressAll);
      return res.status(200).json({ success: true, progress: p.done });
    }

    if (b.action === "saveCourse") {
      if (!isAdmin) return res.status(403).json({ success: false, error: "Only the administrator can edit the course" });
      const clean = cleanCourse(b.course);
      for (const m of clean.modules) for (const l of m.lessons) if (l.loom && !loomEmbed(l.loom)) return res.status(400).json({ success: false, error: `"${l.title}": not a valid Loom link` });
      await writeData("onboarding_course", clean);
      return res.status(200).json({ success: true, course: clean });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (e) {
    console.error("onboarding:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
