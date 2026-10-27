// The logged-in person's name in a dashboard sidebar. Clickable (opens the profile) only when
// onClick is given: students and faculty. Admin and Dean get plain text.
export default function SidebarIdentity({ name, onClick, active }: { name: string; onClick?: () => void; active?: boolean }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const inner = (
    <>
      <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#2563eb", color: "#fff", fontSize: "12px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initial}</span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0, textAlign: "left" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#fff", lineHeight: 1.25, wordBreak: "break-word" }}>{name}</span>
        {onClick && <span style={{ fontSize: "10px", color: "#8eaecb" }}>View profile</span>}
      </span>
    </>
  );
  const base: React.CSSProperties = { display: "flex", alignItems: "center", gap: "9px", padding: "8px", borderRadius: "8px", marginBottom: "14px", width: "100%" };
  if (!onClick) return <div style={base} title={name}>{inner}</div>;
  return (
    <button
      onClick={onClick}
      title="Open my profile"
      style={{ ...base, border: "none", cursor: "pointer", background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)" }}
    >
      {inner}
    </button>
  );
}
