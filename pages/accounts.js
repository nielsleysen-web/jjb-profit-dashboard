// pages/accounts.js
// Account Management — alleen zichtbaar voor de beheerder.
// Goedkeuren van nieuwe accounts, rechten (Finance/Strategy) toekennen of intrekken.

import { useState, useEffect } from "react";

const ui = {
  page: {
    padding: "28px 36px",
    background: "#f7f8fa",
    minHeight: "100vh",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    color: "#0f172a",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #eceef2",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  },
  label: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#8a92a3",
    textTransform: "uppercase",
    letterSpacing: "0.7px",
  },
};

const STATUS_STYLE = {
  pending: { text: "Awaiting approval", color: "#b45309", bg: "#fef3c7" },
  invited: { text: "Invited — not yet activated", color: "#4f46e5", bg: "#eef2ff" },
  active: { text: "Active", color: "#166534", bg: "#dcfce7" },
  disabled: { text: "Blocked", color: "#991b1b", bg: "#fee2e2" },
};

const ROLES = ["Funnel Builder", "Creative Strategist", "Graphic Designer", "Store Manager", "Video Editor", "Media Buyer"];

export default function Accounts() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error);
        setUsers(res.users);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const update = async (userId, payload) => {
    setBusy(userId);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...payload }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error);
      setUsers(res.users);
      return res;
    } catch (err) {
      alert("Failed: " + err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (loading)
    return (
      <div style={{ ...ui.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#8a92a3" }}>Loading…</span>
      </div>
    );
  if (error)
    return (
      <div style={ui.page}>
        <div style={{ ...ui.card, padding: "24px", color: "#dc2626" }}>Error: {error}</div>
      </div>
    );

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <div style={ui.page}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>👥 Account Management</h1>
        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
          Invite people with their access already assigned — they only choose a password and they're in
        </p>
      </div>

      <InvitePanel onInvited={(res) => setUsers(res.users)} />

      {pending.length > 0 && (
        <>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700, color: "#b45309" }}>
            ⏳ Awaiting approval ({pending.length})
          </h2>
          <div style={{ display: "grid", gap: "10px", marginBottom: "24px" }}>
            {pending.map((u) => (
              <UserCard key={u.id} user={u} update={update} busy={busy === u.id} />
            ))}
          </div>
        </>
      )}

      <h2 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: 700 }}>Accounts</h2>
      <div style={{ display: "grid", gap: "10px" }}>
        {others.length === 0 && (
          <div style={{ ...ui.card, padding: "28px", textAlign: "center", color: "#8a92a3", fontSize: "13px" }}>
            No accounts yet.
          </div>
        )}
        {others.map((u) => (
          <UserCard key={u.id} user={u} update={update} busy={busy === u.id} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Iemand uitnodigen: account + rollen vooraf klaarzetten ---------- */
function InvitePanel({ onInvited }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { inviteUrl, emailed, emailError, email }
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const send = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", email, name, roles }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error);
      onInvited(res);
      setResult({ ...res, email });
      setEmail("");
      setName("");
      setRoles([]);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const input = { padding: "10px 12px", border: "1px solid #e2e6ec", borderRadius: "10px", fontSize: "13px", fontFamily: "inherit", outline: "none" };

  if (!open)
    return (
      <button
        onClick={() => { setOpen(true); setResult(null); }}
        style={{ padding: "11px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "11px", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: "22px" }}
      >
        + Invite person
      </button>
    );

  return (
    <div style={{ ...ui.card, padding: "20px 22px", marginBottom: "24px", maxWidth: "760px" }}>
      <div style={{ fontSize: "13.5px", fontWeight: 700, marginBottom: "14px" }}>Invite someone to the Operations Centre</div>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <input style={{ ...input, flex: 1, minWidth: "220px" }} placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={{ ...input, flex: 1, minWidth: "160px" }} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div style={{ ...ui.label, marginBottom: "7px" }}>Give access as</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "16px" }}>
        {ROLES.map((r) => {
          const on = roles.includes(r);
          return (
            <button
              key={r}
              onClick={() => setRoles((p) => (on ? p.filter((x) => x !== r) : [...p, r]))}
              style={{ padding: "7px 13px", borderRadius: "999px", border: on ? "1px solid #2563eb" : "1px solid #e2e6ec", background: on ? "#eff6ff" : "#fff", color: on ? "#1d4ed8" : "#475569", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {on ? "✓ " : ""}{r}
            </button>
          );
        })}
      </div>

      {error && <p style={{ margin: "0 0 12px 0", fontSize: "12.5px", color: "#dc2626" }}>{error}</p>}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={send}
          disabled={busy || !email.trim()}
          style={{ padding: "11px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: busy || !email.trim() ? "default" : "pointer", opacity: busy || !email.trim() ? 0.5 : 1, fontFamily: "inherit" }}
        >
          {busy ? "Sending…" : "✉ Send invitation"}
        </button>
        <button onClick={() => { setOpen(false); setResult(null); setError(""); }} style={{ padding: "11px 18px", background: "#fff", color: "#334155", border: "1px solid #e2e6ec", borderRadius: "10px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Close
        </button>
      </div>

      {result && (
        <div style={{ marginTop: "16px", padding: "14px 16px", background: result.emailed ? "#f0fdf4" : "#fffbeb", border: `1px solid ${result.emailed ? "#bbf7d0" : "#fde68a"}`, borderRadius: "11px" }}>
          <div style={{ fontSize: "12.5px", fontWeight: 700, color: result.emailed ? "#166534" : "#92400e", marginBottom: "6px" }}>
            {result.emailed ? `✓ Invitation emailed to ${result.email}` : "⚠ Email not sent — share this link yourself"}
          </div>
          {!result.emailed && result.emailError && (
            <div style={{ fontSize: "11.5px", color: "#92400e", marginBottom: "8px" }}>{result.emailError}</div>
          )}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              readOnly
              value={result.inviteUrl}
              onFocus={(e) => e.target.select()}
              style={{ flex: 1, padding: "9px 12px", border: "1px solid #e2e6ec", borderRadius: "9px", fontSize: "12px", fontFamily: "ui-monospace, monospace", color: "#1d4ed8", background: "#fff" }}
            />
            <button
              onClick={() => { navigator.clipboard?.writeText(result.inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
              style={{ padding: "9px 16px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "9px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
            >
              {copied ? "✓ Copied" : "📋 Copy link"}
            </button>
          </div>
          <p style={{ margin: "8px 0 0 0", fontSize: "11.5px", color: "#64748b" }}>
            The link is valid for 14 days. They choose a password and are in straight away — with the access you selected.
          </p>
        </div>
      )}
    </div>
  );
}

function SlackIdField({ user, update }) {
  const [val, setVal] = useState(user.slackId || "");
  useEffect(() => setVal(user.slackId || ""), [user.slackId]);
  const saveIt = () => {
    const clean = val.replace(/[<@>\s]/g, "");
    if (clean !== (user.slackId || "")) update(user.id, { updates: { slackId: clean } });
  };
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={saveIt}
      onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
      placeholder="Slack ID (U…)"
      title="Slack member ID — profiel > ⋯ > Copy member ID. Nodig voor de Slack-tag bij meldingen."
      style={{ width: "130px", padding: "7px 10px", border: "1px solid #e2e6ec", borderRadius: "9px", fontSize: "12px", fontFamily: "ui-monospace, monospace", flexShrink: 0, background: val ? "#f0fdf4" : "#ffffff", borderColor: val ? "#bbf7d0" : "#e2e6ec" }}
    />
  );
}

function RolesDropdown({ user, update }) {
  const [open, setOpen] = useState(false);
  const roles = Array.isArray(user.roles) ? user.roles : [];

  const label =
    roles.length === 0 ? "Select roles…" : roles.length <= 2 ? roles.join(", ") : `${roles.length} roles`;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "#ffffff",
          border: "1px solid #e2e6ec",
          borderRadius: "10px",
          fontSize: "12.5px",
          fontWeight: 600,
          color: roles.length ? "#0f172a" : "#94a3b8",
          cursor: "pointer",
          minWidth: "180px",
          justifyContent: "space-between",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>{label}</span>
        <span style={{ color: "#94a3b8", fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          {/* klik buiten = sluiten */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute",
              top: "42px",
              right: 0,
              width: "220px",
              background: "#ffffff",
              border: "1px solid #eceef2",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(15,23,42,0.16)",
              padding: "8px",
              zIndex: 50,
            }}
          >
            {ROLES.map((role) => {
              const has = roles.includes(role);
              return (
                <label
                  key={role}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    background: has ? "#eff6ff" : "transparent",
                    marginBottom: "2px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={has}
                    onChange={() =>
                      update(user.id, {
                        updates: { roles: has ? roles.filter((r) => r !== role) : [...roles, role] },
                      })
                    }
                    style={{ width: "15px", height: "15px", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "12.5px", fontWeight: 600, color: has ? "#1d4ed8" : "#334155" }}>{role}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function UserCard({ user, update, busy }) {
  const isAdmin = user.email === "nielsleysen@gmail.com";
  const status = STATUS_STYLE[user.status] || STATUS_STYLE.active;

  const btn = (label, payload, style = {}) => (
    <button
      onClick={() => update(user.id, payload)}
      disabled={busy}
      style={{
        padding: "7px 12px",
        background: "#ffffff",
        color: "#334155",
        border: "1px solid #e2e6ec",
        borderRadius: "9px",
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        ...style,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ ...ui.card, padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", opacity: busy ? 0.6 : 1 }}>
      {/* Avatar + info */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "200px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "999px", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#475569", flexShrink: 0 }}>
          {(user.name || user.email).charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13.5px", fontWeight: 700 }}>
            {user.name} {isAdmin && <span style={{ fontSize: "10px", color: "#3b82f6", background: "#eff6ff", padding: "2px 7px", borderRadius: "999px", marginLeft: "4px" }}>ADMIN</span>}
          </div>
          <div style={{ fontSize: "12px", color: "#8a92a3", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
        </div>
      </div>

      {/* Status badge */}
      <span style={{ fontSize: "11.5px", fontWeight: 700, color: status.color, background: status.bg, padding: "4px 10px", borderRadius: "999px", flexShrink: 0 }}>
        {status.text}
      </span>

      {/* Slack member ID (voor meldingen + tag in het Slack-notificatiekanaal) */}
      <SlackIdField user={user} update={update} />

      {/* Rollen (dropdown, meerdere selecteerbaar) */}
      {isAdmin ? (
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", flexShrink: 0 }}>Full access</span>
      ) : (
        <RolesDropdown user={user} update={update} />
      )}

      {/* Acties */}
      {!isAdmin && (
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {user.status === "invited" && (
            <button
              onClick={async () => {
                const res = await update(user.id, { action: "resendInvite" });
                if (res?.inviteUrl) {
                  navigator.clipboard?.writeText(res.inviteUrl);
                  alert(res.emailed ? `Invitation resent to ${user.email} — link also copied to your clipboard.` : `Email could not be sent (${res.emailError || "no email service"}). The invitation link is copied to your clipboard:\n\n${res.inviteUrl}`);
                }
              }}
              disabled={busy}
              style={{ padding: "7px 12px", background: "#eef2ff", color: "#4f46e5", border: "1px solid #c7d2fe", borderRadius: "9px", fontSize: "12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              ↻ Resend invite
            </button>
          )}
          {user.status === "pending" && btn("✓ Approve", { updates: { status: "active" } }, { background: "#16a34a", color: "#fff", border: "none" })}
          {user.status === "active" && btn("Block", { updates: { status: "disabled" } }, { color: "#b45309", borderColor: "#fde68a" })}
          {user.status === "disabled" && btn("Reactivate", { updates: { status: "active" } }, { color: "#166534", borderColor: "#bbf7d0" })}
          {btn("Delete", { remove: true }, { color: "#dc2626", borderColor: "#fecaca" })}
        </div>
      )}
    </div>
  );
}
