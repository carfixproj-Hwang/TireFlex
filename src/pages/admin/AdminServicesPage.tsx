// src/pages/admin/AdminServicesPage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  createServiceItemAdmin,
  listAllServiceItemsAdmin,
  updateServiceItemAdmin,
  type ServiceItem,
} from "../../lib/booking";
import { supabase } from "../../lib/supabaseClient";

import "../../styles/adminServicesPremium.css";

type DurUnit = "minutes" | "workdays";

function validate(unit: DurUnit, input: number): string | null {
  if (!Number.isFinite(input)) return "소요시간 값을 확인하세요.";

  if (unit === "minutes") {
    const mins = Math.round(input);
    if (mins < 30) return "소요시간은 최소 30분이어야 합니다.";
    if (mins % 30 !== 0) return "소요시간은 30분 단위여야 합니다.";
    return null;
  }

  const days = Math.round(input);
  if (days < 1) return "영업일(일) 단위는 최소 1일이어야 합니다.";
  return null;
}

function formatDuration(it: Pick<ServiceItem, "duration_minutes" | "duration_unit" | "duration_value">): string {
  if (it.duration_unit === "workdays" && (it.duration_value ?? 0) >= 1) return `${it.duration_value}일`;
  const mins = Number(it.duration_minutes ?? 0);
  if ((!it.duration_unit || it.duration_unit === "minutes") && mins >= 1440 && mins % 1440 === 0) return `${mins / 1440}일`;
  return `${mins}분`;
}

function clampText(v: any) {
  if (v == null) return "";
  const s = String(v);
  return s.trim();
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function chipToneFromMsg(msg: string): "ok" | "err" | "info" {
  const m = msg.toLowerCase();
  if (m.includes("완료") || m.includes("✅") || m.includes("success")) return "ok";
  if (m.includes("실패") || m.includes("error") || m.includes("로드 실패")) return "err";
  return "info";
}

export default function AdminServicesPage() {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [durUnit, setDurUnit] = useState<DurUnit>("minutes");
  const [durInput, setDurInput] = useState<number>(30);
  const [active, setActive] = useState(true);

  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((it) => {
      const hay = [it.name, it.description, String(it.duration_minutes), String(it.duration_unit), String(it.duration_value)]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
        .join(" ");
      return hay.includes(qq);
    });
  }, [items, q]);

  const reload = async () => {
    setLoading(true);
    setMsg("");
    try {
      const list = await listAllServiceItemsAdmin();
      setItems(list);
    } catch (e: any) {
      setMsg(`로드 실패: ${e.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const addItem = async () => {
    setMsg("");
    if (!name.trim()) return setMsg("아이템명을 입력하세요.");

    const err = validate(durUnit, durInput);
    if (err) return setMsg(err);

    try {
      const payload =
        durUnit === "workdays"
          ? {
              name: name.trim(),
              description: desc.trim() ? desc.trim() : null,
              duration_unit: "workdays" as const,
              duration_value: Math.round(durInput),
              duration_minutes: Math.round(durInput) * 1440,
              active,
            }
          : {
              name: name.trim(),
              description: desc.trim() ? desc.trim() : null,
              duration_unit: "minutes" as const,
              duration_value: null,
              duration_minutes: Math.round(durInput),
              active,
            };

      await createServiceItemAdmin(payload);

      setName("");
      setDesc("");
      setDurUnit("minutes");
      setDurInput(30);
      setActive(true);

      await reload();
      setMsg("생성 완료 ✅");
    } catch (e: any) {
      setMsg(`생성 실패: ${e.message ?? String(e)}`);
    }
  };

  const toggleActive = async (it: ServiceItem) => {
    setMsg("");
    try {
      await updateServiceItemAdmin(it.id, { active: !it.active });
      await reload();
      setMsg("상태 변경 완료 ✅");
    } catch (e: any) {
      setMsg(`수정 실패: ${e.message ?? String(e)}`);
    }
  };

  const updateDuration = async (it: ServiceItem, unit: DurUnit, input: number) => {
    setMsg("");
    const err = validate(unit, input);
    if (err) return setMsg(err);

    const patch =
      unit === "workdays"
        ? {
            duration_unit: "workdays" as const,
            duration_value: Math.round(input),
            duration_minutes: Math.round(input) * 1440,
          }
        : {
            duration_unit: "minutes" as const,
            duration_value: null,
            duration_minutes: Math.round(input),
          };

    try {
      await updateServiceItemAdmin(it.id, patch);
      await reload();
      setMsg("소요시간 변경 완료 ✅");
    } catch (e: any) {
      setMsg(`수정 실패: ${e.message ?? String(e)}`);
    }
  };

  const deleteItem = async (it: ServiceItem) => {
    setMsg("");
    const ok = confirm(
      `정말 삭제할까요?\n\n- 아이템: ${it.name}\n- 삭제 후 복구할 수 없습니다.\n- 이미 연결된 예약/데이터가 있으면 삭제가 실패할 수 있습니다.`
    );
    if (!ok) return;

    try {
      setLoading(true);
      const { error } = await supabase.from("service_items").delete().eq("id", it.id);
      if (error) throw new Error(error.message);

      await reload();
      setMsg("삭제 완료 ✅");
    } catch (e: any) {
      setMsg(`삭제 실패: ${e.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const msgTone = msg ? chipToneFromMsg(msg) : "info";

  return (
    <div className="asShell">
      <div className="asBg" aria-hidden />

      <div className="asTop">
        <div className="asTitleWrap">
          <div className="asKicker">Admin</div>
          <h2 className="asTitle">정비 아이템</h2>
          <div className="asSub">분(30분 단위) 또는 영업일(workdays)로 관리합니다.</div>
        </div>

        <div className="asTopRight">
          <div className="asSearch">
            <span className="asSearchIcon" aria-hidden>
              ⌕
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="검색: 아이템명/설명/분/workdays"
              className="asSearchInput"
            />
          </div>

          <button className="asBtn asBtnGhost" onClick={reload} disabled={loading}>
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="asGrid">
        {/* Create */}
        <section className="asCard">
          <div className="asCardHead">
            <div>
              <div className="asCardTitle">새 아이템 추가</div>
              <div className="asCardDesc">예: 하이캠 설치 5일, 엔진오일 교체 60분</div>
            </div>
            <div className="asPill asPillInfo">미리보기: {durUnit === "workdays" ? `${Math.round(durInput)}일` : `${Math.round(durInput)}분`}</div>
          </div>

          <div className="asForm">
            <label className="asField">
              <div className="asLabel">아이템명</div>
              <div className="asInputWrap">
                <span className="asIcon" aria-hidden>
                  ✦
                </span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 하이캠 설치" className="asInput" />
              </div>
            </label>

            <label className="asField">
              <div className="asLabel">소요시간</div>
              <div className="asRow">
                <div className="asInputWrap asInputWrapSm">
                  <input
                    type="number"
                    value={durInput}
                    onChange={(e) => setDurInput(Number(e.target.value))}
                    className="asInput"
                    min={0}
                    step={durUnit === "workdays" ? 1 : 30}
                  />
                </div>

                <div className="asSelectWrap">
                  <select value={durUnit} onChange={(e) => setDurUnit(e.target.value as DurUnit)} className="asSelect">
                    <option value="minutes">분 (minutes)</option>
                    <option value="workdays">일 (workdays)</option>
                  </select>
                  <span className="asSelectArrow" aria-hidden>
                    ▾
                  </span>
                </div>
              </div>
              <div className="asHint">
                {durUnit === "workdays"
                  ? "workdays는 실제 예약에서 ‘여러 영업일’을 차지하는 타입입니다."
                  : "minutes는 30분 단위로 저장됩니다."}
              </div>
            </label>

            <label className="asField asSpan2">
              <div className="asLabel">설명(선택)</div>
              <textarea
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="예: 중간 차단/휴무가 있으면 해당 일은 건너뛰고 이후 작업일만 뒤로 배치됩니다."
                className="asTextarea"
              />
            </label>

            <div className="asFooter">
              <label className="asToggle">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span className="asToggleUi" aria-hidden />
                <span>활성</span>
              </label>

              <button className="asBtn asBtnPrimary" onClick={addItem} disabled={loading}>
                {loading ? "처리중..." : "생성"}
              </button>
            </div>

            {msg ? <div className={cx("asNotice", msgTone === "ok" && "isOk", msgTone === "err" && "isErr")}>{msg}</div> : null}
          </div>
        </section>

        {/* List */}
        <section className="asCard asCardTall">
          <div className="asCardHead">
            <div>
              <div className="asCardTitle">
                아이템 목록 <span className="asCount">({filtered.length}개)</span>
              </div>
              <div className="asCardDesc">클릭 없이 바로 수정, 상태 토글, 삭제까지.</div>
            </div>
            <div className="asPill asPillGlass">팁: workdays는 “n일”로 표시됩니다.</div>
          </div>

          {loading ? (
            <div className="asEmpty">로딩중…</div>
          ) : filtered.length === 0 ? (
            <div className="asEmpty">아이템이 없습니다.</div>
          ) : (
            <div className="asList">
              {filtered.map((it) => (
                <div key={it.id} className="asItem">
                  <div className="asItemMain">
                    <div className="asItemTop">
                      <div className="asItemName">{it.name}</div>
                      <span className={cx("asBadge", it.active ? "isOn" : "isOff")}>
                        <span className="asDot" aria-hidden />
                        {it.active ? "활성" : "비활성"}
                      </span>
                    </div>

                    {clampText(it.description) ? <div className="asItemDesc">{it.description}</div> : <div className="asItemDesc isEmpty">설명 없음</div>}

                    <div className="asMeta">
                      <span className="asMono">id: {it.id}</span>
                      <span className="asSep" aria-hidden>
                        ·
                      </span>
                      <span className="asMono">현재: {formatDuration(it)}</span>
                    </div>
                  </div>

                  <div className="asItemSide">
                    <div className="asSideLabel">소요시간 수정</div>
                    <DurationEditor
                      valueUnit={(it.duration_unit ?? "minutes") === "workdays" ? "workdays" : "minutes"}
                      valueInput={(it.duration_unit ?? "minutes") === "workdays" ? Number(it.duration_value ?? 1) : Number(it.duration_minutes)}
                      onApply={(unit, input) => updateDuration(it, unit, input)}
                      disabled={loading}
                    />

                    <div className="asActions">
                      <button className="asBtn asBtnGhost" onClick={() => toggleActive(it)} disabled={loading}>
                        {it.active ? "비활성화" : "활성화"}
                      </button>
                      <button className="asBtn asBtnDanger" onClick={() => deleteItem(it)} disabled={loading}>
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {msg ? <div className={cx("asNotice asNoticeBottom", msgTone === "ok" && "isOk", msgTone === "err" && "isErr")}>{msg}</div> : null}
        </section>
      </div>
    </div>
  );
}

function DurationEditor({
  valueUnit,
  valueInput,
  onApply,
  disabled,
}: {
  valueUnit: "minutes" | "workdays";
  valueInput: number;
  onApply: (unit: "minutes" | "workdays", input: number) => void;
  disabled?: boolean;
}) {
  const [unit, setUnit] = useState<"minutes" | "workdays">(valueUnit);
  const [input, setInput] = useState<number>(valueInput);

  useEffect(() => {
    setUnit(valueUnit);
    setInput(valueInput);
  }, [valueUnit, valueInput]);

  return (
    <div className="asDur">
      <input
        type="number"
        value={input}
        onChange={(e) => setInput(Number(e.target.value))}
        className="asDurInput"
        min={0}
        step={unit === "workdays" ? 1 : 30}
        disabled={disabled}
      />

      <div className="asSelectWrap">
        <select value={unit} onChange={(e) => setUnit(e.target.value as any)} className="asSelect" disabled={disabled}>
          <option value="minutes">minutes</option>
          <option value="workdays">workdays</option>
        </select>
        <span className="asSelectArrow" aria-hidden>
          ▾
        </span>
      </div>

      <button
        className="asBtn asBtnMini"
        disabled={disabled}
        onClick={() => {
          const err =
            unit === "minutes"
              ? Number.isFinite(input) && input >= 30 && input % 30 === 0
                ? null
                : "분 단위는 30분 이상, 30분 단위여야 합니다."
              : Number.isFinite(input) && input >= 1
                ? null
                : "영업일 단위는 최소 1일이어야 합니다.";
          if (err) return alert(err);
          onApply(unit, input);
        }}
      >
        적용
      </button>
    </div>
  );
}
