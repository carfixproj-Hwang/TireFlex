// src/pages/admin/AdminUsersPage.tsx
import { useEffect, useMemo, useState } from "react";
import { adminListUsers, type AdminUserRow } from "../../lib/adminUsers";

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  background: "#fff",
  boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
};

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "owner" | "staff" | "member">("all");
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

  const filtered = useMemo(() => {
    let list = rows;
    if (roleFilter !== "all") list = list.filter((r) => r.role === roleFilter);
    return list;
  }, [rows, roleFilter]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>회원 관리</h2>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>검색으로 회원을 찾고, 권한 현황을 확인합니다.</div>
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

      <div style={{ ...cardStyle, marginTop: 12, padding: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>검색</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이메일 / 이름 / 전화번호"
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
            />
          </div>

          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>권한 필터</div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#111827",
                outline: "none",
              }}
            >
              <option value="all">전체</option>
              <option value="owner">최고관리자</option>
              <option value="staff">직원</option>
              <option value="member">일반회원</option>
            </select>
          </div>

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
              height: 46,
              alignSelf: "end",
            }}
          >
            검색
          </button>
        </div>

        {msg ? <div style={{ marginTop: 10, color: "crimson" }}>{msg}</div> : null}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {filtered.map((u) => (
            <div
              key={u.user_id}
              style={{
                border: "1px solid #eef2f7",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gridTemplateColumns: "1fr 200px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {u.full_name ?? "(이름없음)"} <span style={{ opacity: 0.6, fontWeight: 700 }}>· {u.email ?? "-"}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                  전화: {u.phone ?? "-"} | 차종: {u.car_model ?? "-"}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                  가입: {u.created_at ? new Date(u.created_at).toLocaleString("ko-KR") : "-"} | ID:{" "}
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{u.user_id}</span>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    display: "inline-flex",
                    padding: "8px 10px",
                    borderRadius: 999,
                    fontWeight: 900,
                    border: "1px solid rgba(0,0,0,0.10)",
                    background:
                      u.role === "owner" ? "rgba(17,24,39,0.10)" : u.role === "staff" ? "rgba(59,130,246,0.10)" : "rgba(16,185,129,0.10)",
                  }}
                >
                  {u.role === "owner" ? "최고관리자" : u.role === "staff" ? "직원" : "일반회원"}
                </span>
              </div>
            </div>
          ))}

          {!loading && filtered.length === 0 ? <div style={{ opacity: 0.7 }}>표시할 회원이 없습니다.</div> : null}
        </div>
      </div>
    </div>
  );
}
