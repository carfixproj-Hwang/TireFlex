// src/pages/admin/AdminStaffPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  adminListUsers,
  ownerSetUserRole,
  type AdminUserRow,
  type AppRole,
} from "../../lib/adminUsers";
import { supabase } from "../../lib/supabaseClient";
import "../../styles/adminPeoplePremium.css";

function roleLabel(r: AppRole) {
  return r === "owner" ? "최고관리자" : r === "staff" ? "직원" : "일반회원";
}

export default function AdminStaffPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  // ✅ FIX: React 18 StrictMode에서 useEffect 2번 실행 방지
  const didInit = useRef(false);

  async function load() {
    // ✅ FIX: 중복 호출 방지
    if (loading) return;

    setLoading(true);
    setMsg(null);
    try {
      const list = await adminListUsers({
        q: q.trim() ? q.trim() : undefined,
        limit: 300,
      });
      setRows(list ?? []);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // ✅ FIX: 최초 1회만 실행
    if (didInit.current) return;
    didInit.current = true;

    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setMyUid(data.user?.id ?? null);
    })();

    load();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const owners = useMemo(() => rows.filter((r) => r.role === "owner"), [rows]);
  const staff = useMemo(() => rows.filter((r) => r.role === "staff"), [rows]);
  const members = useMemo(() => rows.filter((r) => r.role === "member"), [rows]);

  async function setRole(userId: string, next: AppRole) {
    if (myUid && userId === myUid && next !== "owner") {
      alert("내 계정의 owner 권한을 하향할 수 없습니다.");
      return;
    }

    const ok = confirm(
      `권한을 "${roleLabel(next)}"로 변경할까요?\n되돌릴 수는 있지만 운영 권한이 즉시 변경됩니다.`
    );
    if (!ok) return;

    try {
      setActingId(userId);
      setMsg(null);
      await ownerSetUserRole(userId, next);
      await load();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="admPeopleShell">
      <div className="admPeopleBg" aria-hidden />

      <div className="admPeopleTop">
        <div>
          <h2 className="admPeopleTitle">직원 관리 (최고관리자 전용)</h2>
          <div className="admPeopleSub">
            일반회원을 직원으로 승격하거나, 직원 권한을 해제합니다.
          </div>
        </div>

        <button
          className="admBtnPrimary"
          onClick={load}
          disabled={loading || !!actingId}
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <div className="admPeopleGlass">
        <div className="admPeopleBar">
          <div className="admPeopleControls">
            <div className="admField" style={{ minWidth: 340, maxWidth: "100%" }}>
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

            <button
              className="admBtn"
              onClick={load}
              disabled={loading || !!actingId}
            >
              검색
            </button>
          </div>

          <div className="admChips">
            <span className="admChip">Owner {owners.length}</span>
            <span className="admChip">Staff {staff.length}</span>
            <span className="admChip admChipOk">
              Member {members.length}
            </span>
            {actingId ? (
              <span className="admChip admChipWarn">적용중…</span>
            ) : null}
          </div>
        </div>

        {msg ? <div className="admMsg">{msg}</div> : null}

        <div
          style={{
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {/* Staff */}
          <section className="admCard">
            <div className="admCardHeader">
              <div>
                직원 <span>({staff.length})</span>
              </div>
              <span className="admChip">해제 가능</span>
            </div>

            <div className="admList">
              {staff.map((u) => {
                const busy = actingId === u.user_id;
                return (
                  <div key={u.user_id} className="admRow">
                    <div>
                      <div className="admRowTitle">
                        {u.full_name ?? "(이름없음)"} · {u.email ?? "-"}
                      </div>
                      <div className="admRowSub">
                        전화: {u.phone ?? "-"} · 차종: {u.car_model ?? "-"}
                      </div>
                    </div>

                    <button
                      className="admBtnDanger"
                      onClick={() => setRole(u.user_id, "member")}
                      disabled={loading || !!actingId || busy}
                    >
                      {busy ? "처리중..." : "직원 해제"}
                    </button>
                  </div>
                );
              })}
              {!loading && staff.length === 0 && (
                <div className="admEmpty">직원이 없습니다.</div>
              )}
            </div>
          </section>

          {/* Members */}
          <section className="admCard">
            <div className="admCardHeader">
              <div>
                일반회원 <span>({members.length})</span>
              </div>
              <span className="admChip admChipOk">승격 가능</span>
            </div>

            <div className="admList">
              {members.map((u) => {
                const busy = actingId === u.user_id;
                return (
                  <div key={u.user_id} className="admRow">
                    <div>
                      <div className="admRowTitle">
                        {u.full_name ?? "(이름없음)"} · {u.email ?? "-"}
                      </div>
                      <div className="admRowSub">
                        전화: {u.phone ?? "-"} · 차종: {u.car_model ?? "-"}
                      </div>
                    </div>

                    <button
                      className="admBtn"
                      onClick={() => setRole(u.user_id, "staff")}
                      disabled={loading || !!actingId || busy}
                    >
                      {busy ? "처리중..." : "직원 승격"}
                    </button>
                  </div>
                );
              })}
              {!loading && members.length === 0 && (
                <div className="admEmpty">일반회원이 없습니다.</div>
              )}
            </div>
          </section>
        </div>

        {/* mobile */}
        <style>
          {`
            @media (max-width: 980px) {
              .admPeopleGlass > div[style*="grid-template-columns"] {
                grid-template-columns: 1fr !important;
              }
            }
          `}
        </style>
      </div>
    </div>
  );
}
