// pages/_app.js
// Just Jenny Operations Centre — login met accounts, categorieën en rollen.
// Finance: Dashboard, Daily Overview, Product Economics (admin)
// Product Launching: Product Pipeline (Funnel Builders)
// Media Buying: Ready To Launch, Launched (Media Buyers)
// Admin: Account Management

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Head from "next/head";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

const CATEGORIES = [
  {
    name: "Finance",
    perm: "finance",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "📊" },
      { href: "/daily-overview", label: "Daily Overview", icon: "📅" },
      { href: "/product-economics", label: "Product Economics", icon: "📦" },
    ],
  },
  {
    name: "Product Launching",
    perm: "launching",
    items: [{ href: "/product-launching", label: "Product Pipeline", icon: "🚀" }],
  },
  {
    name: "Marketing Creatives",
    perm: "creatives",
    items: [{ href: "/video-editor", label: "Video Editor", icon: "🎬" }],
  },
  {
    name: "Media Buying",
    perm: "mediabuying",
    items: [
      { href: "/ready-to-launch", label: "Ready To Launch", icon: "📣" },
      { href: "/launched", label: "Launched", icon: "✅" },
    ],
  },
  {
    name: "Admin",
    perm: "admin",
    items: [{ href: "/accounts", label: "Account Management", icon: "👥" }],
  },
];

const ALL_PROTECTED = CATEGORIES.flatMap((c) => c.items.map((i) => i.href));

function requiredPerm(pathname) {
  for (const cat of CATEGORIES) {
    if (cat.items.some((i) => i.href === pathname)) return cat.perm;
  }
  return null;
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 14px",
  border: "1px solid #e2e6ec",
  borderRadius: "10px",
  fontSize: "14px",
  marginBottom: "12px",
  outline: "none",
  fontFamily: "inherit",
};

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState("login"); // login | register
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState(null); // { type: "error"|"info", text }
  const [busy, setBusy] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    fetch("/api/auth?action=me")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.success) setUser(res.user);
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/auth?action=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (!result.success) {
        setMessage({ type: "error", text: result.error || "Something went wrong" });
      } else if (result.pending) {
        setMode("login");
        setMessage({ type: "info", text: "Account created! You will get access once the administrator has approved you." });
      } else {
        setUser(result.user);
        setForm({ name: "", email: "", password: "" });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth?action=logout", { method: "POST" }).catch(() => {});
    setUser(null);
  };

  // Inklapbare categorieën in de sidebar (onthouden per apparaat)
  const [collapsed, setCollapsed] = useState({});
  useEffect(() => {
    try {
      setCollapsed(JSON.parse(localStorage.getItem("jjb_nav_collapsed") || "{}"));
    } catch {}
  }, []);
  const toggleCategory = (name) => {
    setCollapsed((c) => {
      const next = { ...c, [name]: !c[name] };
      try {
        localStorage.setItem("jjb_nav_collapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  if (!checked) return null;

  const requiresAuth = ALL_PROTECTED.includes(router.pathname);
  const perm = requiredPerm(router.pathname);

  // Afgeleide rechten uit de rollen: elke Funnel Builder ziet Product Launching,
  // elke Media Buyer ziet Media Buying. Admin ziet alles.
  const userRoles = user?.roles || [];
  const authUser = user
    ? {
        ...user,
        launching: user.admin || userRoles.includes("Funnel Builder"),
        mediabuying: user.admin || userRoles.includes("Media Buyer"),
        creatives:
          user.admin ||
          userRoles.includes("Creative Strategist") ||
          userRoles.includes("Video Editor") ||
          userRoles.includes("Graphic Designer"),
      }
    : null;

  /* ---------- login / registratie ---------- */
  if (requiresAuth && !user) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f7f8fa", fontFamily: "Inter, system-ui, sans-serif", padding: "16px" }}>
        <Head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        </Head>
        <form onSubmit={submit} style={{ background: "white", padding: "40px", borderRadius: "18px", width: "100%", maxWidth: "400px", border: "1px solid #eceef2", boxShadow: "0 4px 24px rgba(15,23,42,0.06)" }}>
          <h1 style={{ margin: "0 0 4px 0", fontSize: "22px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>Just Jenny</h1>
          <p style={{ margin: "0 0 24px 0", fontSize: "13px", color: "#8a92a3" }}>Operations Centre</p>

          {mode === "register" && (
            <input
              type="text"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            autoFocus
            style={inputStyle}
          />
          <input
            type="password"
            placeholder={mode === "register" ? "Choose a password (min. 8 characters)" : "Password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={inputStyle}
          />

          {message && (
            <p style={{ color: message.type === "error" ? "#dc2626" : "#16a34a", fontSize: "13px", margin: "0 0 12px 0", lineHeight: 1.5 }}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", padding: "11px 14px", background: "#0f172a", color: "white", border: "none", borderRadius: "10px", fontSize: "14px", fontWeight: 600, cursor: "pointer", marginBottom: "12px" }}
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>

          <p style={{ margin: 0, fontSize: "13px", color: "#64748b", textAlign: "center" }}>
            {mode === "login" ? (
              <>No account yet?{" "}
                <a onClick={() => { setMode("register"); setMessage(null); }} style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}>Register</a>
              </>
            ) : (
              <>Already have an account?{" "}
                <a onClick={() => { setMode("login"); setMessage(null); }} style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}>Sign in</a>
              </>
            )}
          </p>
        </form>
      </div>
    );
  }

  /* ---------- geen rechten voor deze pagina ---------- */
  const noAccess = requiresAuth && authUser && perm && !authUser[perm];

  const visibleCategories = authUser
    ? CATEGORIES.filter((cat) => authUser[cat.perm] && cat.items.length > 0)
    : [];

  const NavLinks = ({ horizontal }) =>
    visibleCategories.map((cat) => {
      // Bevat deze categorie de actieve pagina? Dan altijd open tonen.
      const containsActive = cat.items.some((i) => i.href === router.pathname);
      const isCollapsed = !horizontal && collapsed[cat.name] && !containsActive;
      return (
      <div
        key={cat.name}
        style={
          horizontal
            ? { display: "flex", gap: "4px", alignItems: "center" }
            : {
                marginBottom: "10px",
                background: "#f6f8fa",
                border: "1px solid #eef1f5",
                borderRadius: "12px",
                padding: "6px",
              }
        }
      >
        {!horizontal && (
          <button
            onClick={() => toggleCategory(cat.name)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 8px",
              marginBottom: isCollapsed ? 0 : "4px",
            }}
          >
            <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              {cat.name}
            </span>
            <span style={{ fontSize: "10px", color: "#475569", fontWeight: 700 }}>{isCollapsed ? "▶" : "▼"}</span>
          </button>
        )}
        {(horizontal || !isCollapsed) && cat.items.map((item) => {
          const active = router.pathname === item.href;
          const count = null;
          return (
            <Link key={item.href} href={item.href}>
              <a
                style={{
                  display: horizontal ? "inline-flex" : "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "6px",
                  padding: horizontal ? "7px 10px" : "8px 10px",
                  background: active ? "#0f172a" : horizontal ? "transparent" : "#ffffff",
                  border: horizontal ? "none" : active ? "1px solid #0f172a" : "1px solid #e8ecf1",
                  color: active ? "#ffffff" : "#475569",
                  textDecoration: "none",
                  fontSize: horizontal ? "12px" : "12.5px",
                  fontWeight: 600,
                  borderRadius: "9px",
                  whiteSpace: "nowrap",
                  marginBottom: horizontal ? 0 : "4px",
                  boxSizing: "border-box",
                }}
              >
                <span>{item.icon} {item.label}</span>
                {count != null && count > 0 && (
                  <span
                    style={{
                      fontSize: "10.5px",
                      fontWeight: 700,
                      color: active ? "#0f172a" : "#ffffff",
                      background: active ? "#ffffff" : "#3b82f6",
                      padding: "1px 7px",
                      borderRadius: "999px",
                      flexShrink: 0,
                    }}
                  >
                    {count}
                  </span>
                )}
              </a>
            </Link>
          );
        })}
      </div>
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh", background: "#f7f8fa", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Notificatie-bel: meldingen voor iedereen, account-aanvragen voor admin */}
      {requiresAuth && user && !isMobile && (
        <div style={{ position: "fixed", top: "18px", right: "24px", zIndex: 70 }}>
          <NotificationBell admin={user.admin} />
        </div>
      )}

      {/* Navigatie */}
      {requiresAuth && user && (isMobile ? (
        <div style={{ background: "white", borderBottom: "1px solid #eceef2", padding: "10px 14px", display: "flex", alignItems: "center", gap: "8px", position: "sticky", top: 0, zIndex: 50 }}>
          <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 700, color: "#0f172a", flexShrink: 0 }}>Just Jenny</h2>
          <nav style={{ display: "flex", gap: "4px", overflowX: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
            <NavLinks horizontal />
          </nav>
          {user && <NotificationBell inline admin={user.admin} />}
          <button onClick={logout} style={{ padding: "7px 10px", background: "#ffffff", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "9px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
            Log out
          </button>
        </div>
      ) : (
        <div style={{ width: "236px", background: "white", borderRight: "1px solid #eceef2", padding: "24px 14px", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ paddingLeft: "12px", marginBottom: "26px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Just Jenny</h2>
            <p style={{ margin: "2px 0 0 0", fontSize: "11px", color: "#8a92a3" }}>Operations Centre</p>
          </div>
          <nav style={{ flex: 1 }}>
            <NavLinks />
          </nav>
          <div style={{ padding: "10px 12px", borderTop: "1px solid #f4f5f7", marginBottom: "10px" }}>
            <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
            <div style={{ fontSize: "11px", color: "#8a92a3", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
          </div>
          <button onClick={logout} style={{ padding: "10px 12px", background: "#ffffff", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "10px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>
            Log out
          </button>
        </div>
      ))}

      {/* Main Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {noAccess ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "24px" }}>
            <div style={{ background: "white", border: "1px solid #eceef2", borderRadius: "16px", padding: "40px", textAlign: "center", maxWidth: "400px" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
              <h2 style={{ margin: "0 0 8px 0", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>No access</h2>
              <p style={{ margin: 0, fontSize: "13.5px", color: "#64748b", lineHeight: 1.6 }}>
                Your account doesn't have access to this category. Ask the administrator to update your permissions.
              </p>
            </div>
          </div>
        ) : (
          <Component {...pageProps} />
        )}
      </div>

      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: Inter, system-ui, sans-serif;
          background: #f7f8fa;
        }
        a {
          color: inherit;
          text-decoration: none;
        }
      `}</style>
    </div>
  );
}

/* ---------- notificatie-bel: meldingen + account-aanvragen (admin) ---------- */

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotificationBell({ inline, admin }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [pending, setPending] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => {
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.success) {
            setItems(res.notifications);
            setUnread(res.unread);
          }
        })
        .catch(() => {});
      if (admin) {
        fetch("/api/accounts")
          .then((r) => (r.ok ? r.json() : null))
          .then((res) => {
            if (res?.success) setPending(res.users.filter((u) => u.status === "pending"));
          })
          .catch(() => {});
      }
    };
    load();
    const iv = setInterval(load, 45000);
    return () => clearInterval(iv);
  }, [router.pathname, admin]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Bij openen: eigen meldingen als gelezen markeren
    if (next && unread > 0) {
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markRead" }),
      })
        .then(() => setUnread(0))
        .catch(() => {});
    }
  };

  const go = (href) => {
    setOpen(false);
    router.push(href || "/product-launching");
  };

  const badge = unread + (admin ? pending.length : 0);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={toggle}
        style={{
          position: "relative",
          width: inline ? "34px" : "40px",
          height: inline ? "34px" : "40px",
          borderRadius: "12px",
          background: "#ffffff",
          border: "1px solid #eceef2",
          boxShadow: inline ? "none" : "0 2px 8px rgba(15,23,42,0.08)",
          cursor: "pointer",
          fontSize: inline ? "15px" : "17px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        🔔
        {badge > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-5px",
              right: "-5px",
              minWidth: "18px",
              height: "18px",
              borderRadius: "999px",
              background: "#dc2626",
              color: "#ffffff",
              fontSize: "10.5px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              border: "2px solid #ffffff",
              boxSizing: "border-box",
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "48px",
            right: 0,
            width: "320px",
            background: "#ffffff",
            border: "1px solid #eceef2",
            borderRadius: "14px",
            boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
            padding: "14px",
            zIndex: 80,
            maxHeight: "70vh",
            overflowY: "auto",
          }}
        >
          {/* Admin: nieuwe account-aanvragen */}
          {admin && pending.length > 0 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#b45309", marginBottom: "8px" }}>
                ⏳ Account requests ({pending.length})
              </div>
              {pending.map((u) => (
                <div
                  key={u.id}
                  onClick={() => go("/accounts")}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", background: "#fef9ec", borderRadius: "10px", cursor: "pointer", marginBottom: "5px" }}
                >
                  <div style={{ width: "28px", height: "28px", borderRadius: "999px", background: "#fde68a", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", color: "#92400e", flexShrink: 0 }}>
                    {(u.name || u.email).charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                    <div style={{ fontSize: "10.5px", color: "#8a92a3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Eigen meldingen */}
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Notifications</div>
          {items.length === 0 ? (
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>No notifications yet.</p>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                onClick={() => go(n.href)}
                style={{
                  padding: "8px 10px",
                  background: n.read ? "#ffffff" : "#eff6ff",
                  border: "1px solid #eef0f3",
                  borderRadius: "10px",
                  cursor: "pointer",
                  marginBottom: "5px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#0f172a", lineHeight: 1.45 }}>{n.text}</div>
                <div style={{ fontSize: "10.5px", color: "#94a3b8", marginTop: "2px" }}>{timeAgo(n.at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
