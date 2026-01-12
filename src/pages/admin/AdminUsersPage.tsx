// src/pages/admin/AdminUsersPage.tsx
import { useEffect, useMemo, useState } from "react";
import { adminListUsers, type AdminUserRow } from "../../lib/adminUsers";
import "../../styles/adminPeoplePremium.css";

type RoleFilter = "all" | "owner" | "staff" | "member";

// const ROLE_LABEL: Record<Exclude<RoleFilter, "all">, string> = {
//   owner: "최고관리자",
//   staff: "직원",
//   member: "일반회원",
// };

function rolePillClass(role: AdminUserRow["role"]) {
  if (role === "owner") return "admRolePill admRoleOwner";
  if (role === "staff") return "admRolePill admRoleStaff";
  return "admRolePill admRoleMember";
}

export default function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const list = await adminListUsers({ q: q.trim() ? q.trim() : undefined, limit: 300 });
      setRows(list ?? []);
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

    // 보기 좋은 정렬: owner → staff → member, 최신 가입 먼저
    const rank = (role: string) => (role === "owner" ? 0 : role === "staff" ? 1 : 2);
    return [...list].sort((a, b) => {
      const ra = rank(a.role);
      const rb = rank(b.role);
      if (ra !== rb) return ra - rb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
  }, [rows, roleFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const owners = rows.filter((r) => r.role === "owner").length;
    const staff = rows.filter((r) => r.role === "staff").length;
    const members = rows.filter((r) => r.role === "member").length;
    return { total, owners, staff, members };
  }, [rows]);

  return (
    <div className="admPeopleShell">
      <div className="admPeopleBg" aria-hidden />

      <div className="admPeopleTop">
        <div>
          <h2 className="admPeopleTitle">회원 관리</h2>
          <div className="admPeopleSub">검색으로 회원을 찾고, 권한/프로필을 확인합니다.</div>
        </div>

        <button className="admBtnPrimary" onClick={load} disabled={loading}>
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <div className="admPeopleGlass">
        <div className="admPeopleBar">
          <div className="admPeopleControls">
            <div className="admField" style={{ minWidth: 320, maxWidth: "100%" }}>
              <div className="admLabel">검색</div>
              <input
                className="admInput"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="이메일 / 이름 / 전화번호"
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>

            <div className="admField">
              <div className="admLabel">권한 필터</div>
              <div className="admSelectWrap">
                <select className="admSelect" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}>
                  <option value="all">전체</option>
                  <option value="owner">최고관리자</option>
                  <option value="staff">직원</option>
                  <option value="member">일반회원</option>
                </select>
                <span className="admSelectArrow" aria-hidden>
                  ▾
                </span>
              </div>
            </div>

            <button className="admBtn" onClick={load} disabled={loading}>
              검색
            </button>
          </div>

          <div className="admChips">
            <span className="admChip">전체 {stats.total}</span>
            <span className="admChip admChipWarn">Owner {stats.owners}</span>
            <span className="admChip">Staff {stats.staff}</span>
            <span className="admChip admChipOk">Member {stats.members}</span>
          </div>
        </div>

        {msg ? <div className="admMsg">{msg}</div> : null}

        <div className="admList">
          {filtered.map((u) => (
            <button key={u.user_id} type="button" className="admRowBtn" onClick={() => setSelected(u)} title="클릭해서 상세 보기">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="admRowTop">
                    <div className="admRowTitle">
                      {u.full_name ?? "(이름없음)"}{" "}
                      <span className="admRowMuted">· {u.email ?? "-"}</span>
                    </div>
                  </div>
                  <div className="admRowSub">전화: {u.phone ?? "-"} · 차종: {u.car_model ?? "-"}</div>
                  <div className="admMono">
                    가입: {u.created_at ? new Date(u.created_at).toLocaleString("ko-KR") : "-"} · ID: {u.user_id}
                  </div>
                </div>

                <span className={rolePillClass(u.role)}>
                  {u.role === "owner" ? "최고관리자" : u.role === "staff" ? "직원" : "일반회원"}
                </span>
              </div>
            </button>
          ))}

          {!loading && filtered.length === 0 ? (
            <div style={{ opacity: 0.8, color: "rgba(255,255,255,0.88)" }}>표시할 회원이 없습니다.</div>
          ) : null}
        </div>
      </div>

      {/* Detail Modal */}
      {selected ? (
        <div
          className="admModalBackdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="admModal">
            <div className="admModalHead">
              <div>
                <div className="admModalTitle">회원 상세</div>
                <div className="admModalSub">개인정보는 관리자 화면에서만 확인 가능하게 유지하세요.</div>
              </div>
              <button className="admIconBtn" onClick={() => setSelected(null)} aria-label="닫기">
                ✕
              </button>
            </div>

            <div className="admModalBody">
              <div className="admKV">
                <div className="admK">이름</div>
                <div className="admV">{selected.full_name ?? "-"}</div>
              </div>
              <div className="admKV">
                <div className="admK">이메일</div>
                <div className="admV">{selected.email ?? "-"}</div>
              </div>
              <div className="admKV">
                <div className="admK">전화</div>
                <div className="admV">{selected.phone ?? "-"}</div>
              </div>
              <div className="admKV">
                <div className="admK">차종</div>
                <div className="admV">{selected.car_model ?? "-"}</div>
              </div>
              <div className="admKV">
                <div className="admK">권한</div>
                <div className="admV">
                  <span className={rolePillClass(selected.role)}>
                    {selected.role === "owner" ? "최고관리자" : selected.role === "staff" ? "직원" : "일반회원"}
                  </span>
                </div>
              </div>
              <div className="admKV">
                <div className="admK">가입일</div>
                <div className="admV">{selected.created_at ? new Date(selected.created_at).toLocaleString("ko-KR") : "-"}</div>
              </div>
              <div className="admKV">
                <div className="admK">User ID</div>
                <div className="admV" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                  {selected.user_id}
                </div>
              </div>
            </div>

            <div className="admModalFoot">
              <button className="admBtn" onClick={() => setSelected(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
