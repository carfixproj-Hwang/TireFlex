// src/pages/admin/OwnerStaffPage.tsx
import { useEffect, useMemo, useState } from "react";
import { ownerListProfiles, ownerSetProfileRole, type ProfileRow } from "../../lib/ownerAdmin";

type Role = ProfileRow["role"];
const ROLE_LABEL: Record<Role, string> = {
  owner: "최고관리자",
  staff: "직원",
  member: "일반회원",
};

export default function OwnerStaffPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftRoleById, setDraftRoleById] = useState<Record<string, Role>>({});

  const visible = useMemo(() => rows, [rows]);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const list = await ownerListProfiles({ q, lim: 80, off: 0 });
      setRows(list);
      const draft: Record<string, Role> = {};
      list.forEach((r) => (draft[r.id] = r.role));
      setDraftRoleById(draft);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    overflow: "hidden",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 12,
    padding: "12px 12px",
    color: "rgba(255,255,255,0.92)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "12px 12px",
    color: "rgba(255,255,255,0.92)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    verticalAlign: "middle",
    fontSize: 13,
  };

  const input: React.CSSProperties = {
    padding: "11px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,18,32,0.75)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    width: 320,
    maxWidth: "100%",
  };

  const btn: React.CSSProperties = {
    padding: "11px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    cursor: "pointer",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "11px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.92)",
    color: "#0b0f18",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 16px 34px rgba(0,0,0,0.35)",
  };

  const selectWrap: React.CSSProperties = { position: "relative", display: "inline-flex", alignItems: "center" };
  const select: React.CSSProperties = {
    padding: "10px 42px 10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,18,32,0.92)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
  };
  const arrow: React.CSSProperties = { position: "absolute", right: 12, pointerEvents: "none", opacity: 0.9 };

  return (
    <div
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: 12,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background:
            "radial-gradient(900px 420px at 18% 8%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(800px 420px at 82% 12%, rgba(255,255,255,0.07), transparent 62%), linear-gradient(180deg, #0b1220, #070b14)",
        }}
      />

      <h2 style={{ margin: "0 0 10px 0", color: "rgba(255,255,255,0.94)", fontWeight: 950, letterSpacing: "-0.6px" }}>
        최고관리자: 직원/권한 관리
      </h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이메일 / 이름 / 전화 검색"
          style={input}
        />
        <button onClick={refresh} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
          {loading ? "불러오는 중..." : "검색/새로고침"}
        </button>
        {msg ? <span style={{ color: "#ffb4c0", fontWeight: 900 }}>{msg}</span> : null}
      </div>

      <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", backdropFilter: "blur(10px)", boxShadow: "0 10px 40px rgba(0,0,0,0.35)" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>이메일</th>
              <th style={th}>이름</th>
              <th style={th}>전화</th>
              <th style={th}>현재 권한</th>
              <th style={th}>변경</th>
              <th style={th}>적용</th>
            </tr>
          </thead>

          <tbody>
            {visible.map((r) => {
              const draft = draftRoleById[r.id] ?? r.role;
              const changed = draft !== r.role;
              const saving = savingId === r.id;

              return (
                <tr key={r.id} style={{ background: "rgba(255,255,255,0.02)" }}>
                  <td style={td}>{r.email ?? "-"}</td>
                  <td style={td}>{r.full_name ?? "-"}</td>
                  <td style={td}>{r.phone ?? "-"}</td>
                  <td style={td}>
                    <b>{ROLE_LABEL[r.role]}</b>
                  </td>

                  <td style={td}>
                    <div style={selectWrap}>
                      <select
                        value={draft}
                        onChange={(e) =>
                          setDraftRoleById((prev) => ({
                            ...prev,
                            [r.id]: e.target.value as Role,
                          }))
                        }
                        style={select}
                        disabled={saving}
                      >
                        <option value="member">{ROLE_LABEL.member}</option>
                        <option value="staff">{ROLE_LABEL.staff}</option>
                        <option value="owner">{ROLE_LABEL.owner}</option>
                      </select>
                      <span style={arrow} aria-hidden>
                        ▾
                      </span>
                    </div>
                  </td>

                  <td style={td}>
                    <button
                      style={{
                        ...btn,
                        opacity: !changed || saving ? 0.55 : 1,
                        cursor: !changed || saving ? "not-allowed" : "pointer",
                        background: changed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                      }}
                      disabled={!changed || saving}
                      onClick={async () => {
                        try {
                          setSavingId(r.id);
                          setMsg(null);
                          await ownerSetProfileRole(r.id, draft);
                          await refresh();
                        } catch (e: any) {
                          setMsg(e?.message ?? String(e));
                        } finally {
                          setSavingId(null);
                        }
                      }}
                      title={changed ? "권한 변경 적용" : "변경사항 없음"}
                    >
                      {saving ? "적용중..." : "적용"}
                    </button>
                  </td>
                </tr>
              );
            })}

            {visible.length === 0 ? (
              <tr>
                <td style={{ ...td, padding: 16, opacity: 0.8 }} colSpan={6}>
                  결과가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8, color: "rgba(255,255,255,0.88)" }}>
        * 안전장치: 마지막 owner 제거 금지 / 본인 owner 권한 하향 금지 / 변경 로그 저장
      </div>
    </div>
  );
}
