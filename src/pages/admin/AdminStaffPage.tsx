// src/pages/admin/AdminStaffPage.tsx
import { useEffect, useMemo, useState } from "react";
import { adminListUsers, ownerSetUserRole, type AdminUserRow, type AppRole } from "../../lib/adminUsers";

function roleLabel(r: AppRole) {
  return r === "owner" ? "최고관리자" : r === "staff" ? "직원" : "일반회원";
}

export default function AdminStaffPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminUserRow[]>([]);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const list = await adminListUsers({ q: q.trim() ? q.trim() : undefined, limit: 300 });
      setRows(list);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const staff = useMemo(() => rows.filter((r) => r.role === "staff"), [rows]);
  const members = useMemo(() => rows.filter((r) => r.role === "member"), [rows]);

  async function setRole(userId: string, next: AppRole) {
    const ok = confirm(`권한을 "${roleLabel(next)}"로 변경할까요?\n되돌릴 수는 있지만 운영 권한이 즉시 변경됩니다.`);
    if (!ok) return;

    try {
      setLoading(true);
      await ownerSetUserRole(userId, next);
      await load();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>직원 관리 (최고관리자 전용)</h2>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>일반회원을 직원으로 승격하거나, 직원 권한을 해제합니다.</div>
        </div>

        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이메일 / 이름 / 전화번호"
          style={{
            flex: 1,
            minWidth: 240,
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
        />
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          검색
        </button>
      </div>

      {msg ? <div style={{ marginTop: 10, color: "crimson" }}>{msg}</div> : null}

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>직원 ({staff.length})</div>

          <div style={{ display: "grid", gap: 10 }}>
            {staff.map((u) => (
              <div
                key={u.user_id}
                style={{
                  border: "1px solid #eef2f7",
                  borderRadius: 14,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {u.full_name ?? "(이름없음)"} <span style={{ opacity: 0.6 }}>· {u.email ?? "-"}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>전화: {u.phone ?? "-"} | 차종: {u.car_model ?? "-"}</div>
                </div>

                <button
                  onClick={() => setRole(u.user_id, "member")}
                  disabled={loading}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(220,38,38,0.25)",
                    background: "rgba(220,38,38,0.08)",
                    fontWeight: 900,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  직원 해제
                </button>
              </div>
            ))}
            {!loading && staff.length === 0 ? <div style={{ opacity: 0.7 }}>직원이 없습니다.</div> : null}
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 16, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>일반회원 ({members.length})</div>

          <div style={{ display: "grid", gap: 10 }}>
            {members.map((u) => (
              <div
                key={u.user_id}
                style={{
                  border: "1px solid #eef2f7",
                  borderRadius: 14,
                  padding: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {u.full_name ?? "(이름없음)"} <span style={{ opacity: 0.6 }}>· {u.email ?? "-"}</span>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>전화: {u.phone ?? "-"} | 차종: {u.car_model ?? "-"}</div>
                </div>

                <button
                  onClick={() => setRole(u.user_id, "staff")}
                  disabled={loading}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(59,130,246,0.25)",
                    background: "rgba(59,130,246,0.10)",
                    fontWeight: 900,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  직원 승격
                </button>
              </div>
            ))}
            {!loading && members.length === 0 ? <div style={{ opacity: 0.7 }}>일반회원이 없습니다.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
