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
  active: { text: "Active", color: "#166534", bg: "#dcfce7" },
  disabled: { text: "Blocked", color: "#991b1b", bg: "#fee2e2" },
};

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
    } catch (err) {
      alert("Failed: " + err.message);
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
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>👥 Account Management</h1>
        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#8a92a3" }}>
          Approve new accounts and manage who has access to Finance, Strategy and Marketing
        </p>
      </div>

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

function Toggle({ label, checked, onChange, disabled }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "7px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={!!checked} onChange={onChange} disabled={disabled} style={{ width: "15px", height: "15px", cursor: "inherit" }} />
      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#334155" }}>{label}</span>
    </label>
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

      {/* Rechten */}
      <div style={{ display: "flex", gap: "14px", flexShrink: 0 }}>
        <Toggle
          label="Finance"
          checked={isAdmin || user.finance}
          disabled={isAdmin}
          onChange={() => update(user.id, { updates: { finance: !user.finance } })}
        />
        <Toggle
          label="Strategy"
          checked={isAdmin || user.strategy}
          disabled={isAdmin}
          onChange={() => update(user.id, { updates: { strategy: !user.strategy } })}
        />
        <Toggle
          label="Marketing"
          checked={isAdmin || user.marketing}
          disabled={isAdmin}
          onChange={() => update(user.id, { updates: { marketing: !user.marketing } })}
        />
      </div>

      {/* Acties */}
      {!isAdmin && (
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          {user.status === "pending" && btn("✓ Approve", { updates: { status: "active" } }, { background: "#16a34a", color: "#fff", border: "none" })}
          {user.status === "active" && btn("Block", { updates: { status: "disabled" } }, { color: "#b45309", borderColor: "#fde68a" })}
          {user.status === "disabled" && btn("Reactivate", { updates: { status: "active" } }, { color: "#166534", borderColor: "#bbf7d0" })}
          {btn("Delete", { remove: true }, { color: "#dc2626", borderColor: "#fecaca" })}
        </div>
      )}
    </div>
  );
}
