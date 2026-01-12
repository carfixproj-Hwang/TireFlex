// src/pages/admin/OwnerStaffPage.tsx
import { useEffect, useMemo, useState } from "react";
import { ownerListProfiles, ownerSetProfileRole, type ProfileRow } from "../../lib/ownerAdmin";
import { supabase } from "../../lib/supabaseClient";
import "../../styles/adminPeoplePremium.css";

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
  const [myUid, setMyUid] = useState<string | null>(null);

  const visible = useMemo(() => rows, [rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const owners = rows.filter((r) => r.role === "owner").length;
    const staff = rows.filter((r) => r.role === "staff").length;
    const members = rows.filter((r) => r.role === "member").length;
    return { total, owners, staff, members };
  }, [rows]);

  async function refresh() {
    setLoading(true);
    setMsg(null);
    try {
      const list = await ownerListProfiles({ q, lim: 120, off: 0 });
      setRows(list);

      const draft: Record<string, Role> = {};
      list.forEach((r) => (draft[r.id] = r.role));
      setDraftRoleById(draft);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setMyUid(data.user?.id ?? null);
    })();

    refresh();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admPeopleShell">
      <div className="admPeopleBg" aria-hidden />

      <div className="admPeopleTop">
        <div>
          <h2 className="admPeopleTitle">직원/권한 관리 (Owner 전용)</h2>
          <div className="admPeopleSub">권한 변경은 신중하게. 서버에서 안전장치(RLS/RPC)도 반드시 걸어두세요.</div>
        </div>

        <button className="admBtnPrimary" onClick={refresh} disabled={loading || !!savingId}>
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
                placeholder="이메일 / 이름 / 전화 검색"
                onKeyDown={(e) => {
                  if (e.key === "Enter") refresh();
                }}
              />
            </div>

            <button className="admBtn" onClick={refresh} disabled={loading || !!savingId}>
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

        <div className="admTableWrap">
          <table className="admTable">
            <thead>
              <tr>
                <th className="admTh">이메일</th>
                <th className="admTh">이름</th>
                <th className="admTh">전화</th>
                <th className="admTh">현재 권한</th>
                <th className="admTh">변경</th>
                <th className="admTh">적용</th>
              </tr>
            </thead>

            <tbody>
              {visible.map((r) => {
                const draft = draftRoleById[r.id] ?? r.role;
                const changed = draft !== r.role;
                const saving = savingId === r.id;

                // UI 안전장치(서버에서도 반드시 동일하게 막아야 함)
                const isMe = !!(myUid && r.id === myUid);
                const blockSelfDowngrade = !!(isMe && r.role === "owner" && draft !== "owner");

                return (
                  <tr key={r.id} style={{ background: "rgba(255,255,255,0.02)" }}>
                    <td className="admTd">{r.email ?? "-"}</td>
                    <td className="admTd">
                      {r.full_name ?? "-"}{" "}
                      {isMe ? (
                        <span className="admChip" style={{ marginLeft: 8 }}>
                          내 계정
                        </span>
                      ) : null}
                    </td>
                    <td className="admTd">{r.phone ?? "-"}</td>
                    <td className="admTd">
                      <b>{ROLE_LABEL[r.role]}</b>
                    </td>

                    <td className="admTd">
                      <div className="admSelectWrap">
                        <select
                          className="admSelect"
                          value={draft}
                          onChange={(e) =>
                            setDraftRoleById((prev) => ({
                              ...prev,
                              [r.id]: e.target.value as Role,
                            }))
                          }
                          disabled={saving || loading}
                          title={blockSelfDowngrade ? "본인 owner 권한 하향은 금지" : "권한 선택"}
                        >
                          <option value="member">{ROLE_LABEL.member}</option>
                          <option value="staff">{ROLE_LABEL.staff}</option>
                          <option value="owner">{ROLE_LABEL.owner}</option>
                        </select>
                        <span className="admSelectArrow" aria-hidden>
                          ▾
                        </span>
                      </div>
                    </td>

                    <td className="admTd">
                      <button
                        className={blockSelfDowngrade ? "admBtnDanger" : "admBtn"}
                        disabled={!changed || saving || loading || blockSelfDowngrade}
                        onClick={async () => {
                          try {
                            const ok = confirm(`권한을 "${ROLE_LABEL[r.role]}" → "${ROLE_LABEL[draft]}" 로 변경할까요?`);
                            if (!ok) return;

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
                        title={
                          blockSelfDowngrade
                            ? "본인 owner 권한 하향은 금지"
                            : changed
                              ? "권한 변경 적용"
                              : "변경사항 없음"
                        }
                      >
                        {saving ? "적용중..." : "적용"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {visible.length === 0 ? (
                <tr>
                  <td className="admTd" style={{ padding: 16, opacity: 0.8 }} colSpan={6}>
                    결과가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admHint">
        * 권한 변경 안전장치(권장): 마지막 owner 제거 금지 / 본인 owner 하향 금지 / 변경 로그 저장 (UI + RPC 둘 다)
      </div>
    </div>
  );
}
