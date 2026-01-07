// src/pages/admin/AdminServicesPage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  createServiceItemAdmin,
  listAllServiceItemsAdmin,
  updateServiceItemAdmin,
  type ServiceItem,
} from "../../lib/booking";
import { supabase } from "../../lib/supabaseClient";

type DurUnit = "minutes" | "days";

function toMinutes(input: number, unit: DurUnit): number {
  if (!Number.isFinite(input)) return NaN;
  const mins = unit === "days" ? input * 1440 : input;
  return Math.round(mins);
}

function validateMinutes(mins: number): string | null {
  if (!Number.isFinite(mins)) return "소요시간 값을 확인하세요.";
  if (mins < 30) return "소요시간은 최소 30분이어야 합니다.";
  if (mins % 30 !== 0) return "소요시간은 30분 단위여야 합니다.";
  return null;
}

function formatDuration(mins: number): string {
  if (mins % 1440 === 0) return `${mins / 1440}일`;
  return `${mins}분`;
}

function clampText(v: any) {
  if (v == null) return "";
  const s = String(v);
  return s.trim();
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

  const durMinutes = useMemo(() => toMinutes(durInput, durUnit), [durInput, durUnit]);

  const styles = {
    page: { maxWidth: 980, margin: "0 auto", padding: 10 } as React.CSSProperties,
    bg: {
      position: "fixed",
      inset: 0,
      zIndex: -1,
      background:
        "radial-gradient(900px 420px at 18% 8%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(800px 420px at 82% 12%, rgba(255,255,255,0.07), transparent 62%), linear-gradient(180deg, #0b1220, #070b14)",
    } as React.CSSProperties,
    h2: { marginTop: 0, color: "rgba(255,255,255,0.94)", fontWeight: 950, letterSpacing: "-0.5px" } as React.CSSProperties,
    card: {
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 18,
      padding: 14,
      background: "rgba(255,255,255,0.05)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
    } as React.CSSProperties,
    label: { fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.90)", marginBottom: 6 } as React.CSSProperties,
    input: {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.75)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
    } as React.CSSProperties,
    textarea: {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.75)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
      resize: "vertical",
    } as React.CSSProperties,
    selectWrap: { position: "relative", display: "inline-flex", alignItems: "center" } as React.CSSProperties,
    select: {
      padding: "10px 44px 10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.92)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      cursor: "pointer",
    } as React.CSSProperties,
    selectArrow: {
      position: "absolute",
      right: 12,
      pointerEvents: "none",
      fontSize: 12,
      opacity: 0.85,
      color: "rgba(255,255,255,0.85)",
    } as React.CSSProperties,
    btnPrimary: (disabled?: boolean) =>
      ({
        padding: "10px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.18)",
        background: disabled ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.90)",
        color: "#0b0f18",
        fontWeight: 950,
        cursor: disabled ? "not-allowed" : "pointer",
      } as React.CSSProperties),
    btnGhost: (disabled?: boolean) =>
      ({
        padding: "10px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
      } as React.CSSProperties),
    btnDanger: (disabled?: boolean) =>
      ({
        padding: "10px 14px",
        borderRadius: 14,
        border: "1px solid rgba(251,113,133,0.35)",
        background: "rgba(251,113,133,0.14)",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 950,
        cursor: disabled ? "not-allowed" : "pointer",
      } as React.CSSProperties),
    badge: (on: boolean) =>
      ({
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: on ? "1px solid rgba(110,231,183,0.28)" : "1px solid rgba(251,113,133,0.28)",
        background: on ? "rgba(110,231,183,0.12)" : "rgba(251,113,133,0.12)",
        color: "rgba(255,255,255,0.92)",
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      } as React.CSSProperties),
    dot: (on: boolean) =>
      ({
        width: 7,
        height: 7,
        borderRadius: 999,
        background: on ? "rgba(110,231,183,0.95)" : "rgba(251,113,133,0.95)",
        boxShadow: `0 0 16px ${on ? "rgba(110,231,183,0.65)" : "rgba(251,113,133,0.65)"}`,
      } as React.CSSProperties),
    toast: {
      marginTop: 10,
      padding: 10,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
    } as React.CSSProperties,
    row: {
      display: "grid",
      gridTemplateColumns: "1.4fr 0.8fr 0.5fr 0.9fr",
      gap: 10,
      alignItems: "center",
      padding: 12,
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.04)",
    } as React.CSSProperties,
    small: { fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.88)" } as React.CSSProperties,
  };

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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((it) => {
      const hay = [it.name, it.description, String(it.duration_minutes)]
        .filter(Boolean)
        .map((x) => String(x).toLowerCase())
        .join(" ");
      return hay.includes(qq);
    });
  }, [items, q]);

  const addItem = async () => {
    setMsg("");
    if (!name.trim()) return setMsg("아이템명을 입력하세요.");

    const err = validateMinutes(durMinutes);
    if (err) return setMsg(err);

    try {
      await createServiceItemAdmin({
        name: name.trim(),
        description: desc.trim() ? desc.trim() : null,
        duration_minutes: durMinutes,
        active,
      });

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
    } catch (e: any) {
      setMsg(`수정 실패: ${e.message ?? String(e)}`);
    }
  };

  const updateDurationMinutes = async (it: ServiceItem, nextMinutes: number) => {
    setMsg("");
    const err = validateMinutes(nextMinutes);
    if (err) return setMsg(err);

    try {
      await updateServiceItemAdmin(it.id, { duration_minutes: nextMinutes });
      await reload();
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

      // ✅ 실제 삭제 (테이블명이 다르면 여기만 바꾸면 됨)
      // 대부분 프로젝트에서 "service_items"를 사용
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

  return (
    <div style={styles.page}>
      <div style={styles.bg} aria-hidden />

      <h2 style={styles.h2}>관리자: 정비 아이템 관리</h2>

      {/* 생성 카드 */}
      <div style={{ ...styles.card, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>새 아이템 추가</div>
          <div style={styles.small}>30분 단위 저장 · 예: 5일 = 7200분</div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12, gridTemplateColumns: "1.2fr 0.8fr" }}>
          <div>
            <div style={styles.label}>아이템명</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 하이캠 설치" style={styles.input} />
          </div>

          <div>
            <div style={styles.label}>소요시간</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="number"
                value={durInput}
                onChange={(e) => setDurInput(Number(e.target.value))}
                style={{ ...styles.input, width: 160 }}
                min={0}
                step={durUnit === "days" ? 1 : 30}
              />
              <div style={styles.selectWrap}>
                <select value={durUnit} onChange={(e) => setDurUnit(e.target.value as DurUnit)} style={styles.select}>
                  <option value="minutes">분</option>
                  <option value="days">일</option>
                </select>
                <span style={styles.selectArrow}>▾</span>
              </div>
              <span style={styles.small}>
                저장값: <b>{Number.isFinite(durMinutes) ? `${durMinutes}분 (${formatDuration(durMinutes)})` : "-"}</b>
              </span>
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <div style={styles.label}>설명(선택)</div>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="예: 합성유/부품 상황에 따라 시간이 달라질 수 있습니다."
              style={styles.textarea}
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "rgba(255,255,255,0.90)" }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              활성
            </label>

            <button onClick={addItem} disabled={loading} style={styles.btnPrimary(loading)}>
              {loading ? "처리중..." : "생성"}
            </button>
          </div>
        </div>

        {msg ? <div style={styles.toast}>{msg}</div> : null}
      </div>

      {/* 목록 카드 */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>
            아이템 목록 <span style={{ opacity: 0.7, fontSize: 12 }}>({filtered.length}개)</span>
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색: 아이템명/설명/분"
            style={{ ...styles.input, width: 320 }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ color: "rgba(255,255,255,0.85)" }}>로딩중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: "rgba(255,255,255,0.75)" }}>아이템이 없습니다.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((it) => (
                <div key={it.id} style={styles.row}>
                  <div>
                    <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.94)" }}>{it.name}</div>
                    {clampText(it.description) ? (
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8, color: "rgba(255,255,255,0.88)" }}>
                        {it.description}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65, color: "rgba(255,255,255,0.85)" }}>
                      id: {it.id}
                    </div>
                  </div>

                  <div>
                    <div style={styles.label}>소요시간</div>
                    <DurationEditor valueMinutes={it.duration_minutes} onApplyMinutes={(mins) => updateDurationMinutes(it, mins)} />
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.88)" }}>
                      현재: {formatDuration(it.duration_minutes)}
                    </div>
                  </div>

                  <div>
                    <div style={styles.label}>상태</div>
                    <span style={styles.badge(it.active)}>
                      <span style={styles.dot(it.active)} aria-hidden />
                      {it.active ? "활성" : "비활성"}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => toggleActive(it)} style={styles.btnGhost(false)} disabled={loading}>
                      {it.active ? "비활성화" : "활성화"}
                    </button>
                    <button onClick={() => deleteItem(it)} style={styles.btnDanger(false)} disabled={loading}>
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {msg ? <div style={styles.toast}>{msg}</div> : null}
      </div>
    </div>
  );
}

function DurationEditor({
  valueMinutes,
  onApplyMinutes,
}: {
  valueMinutes: number;
  onApplyMinutes: (mins: number) => void;
}) {
  type DurUnit = "minutes" | "days";

  function toMinutes(input: number, unit: DurUnit): number {
    if (!Number.isFinite(input)) return NaN;
    const mins = unit === "days" ? input * 1440 : input;
    return Math.round(mins);
  }

  function validateMinutes(mins: number): string | null {
    if (!Number.isFinite(mins)) return "소요시간 값을 확인하세요.";
    if (mins < 30) return "소요시간은 최소 30분이어야 합니다.";
    if (mins % 30 !== 0) return "소요시간은 30분 단위여야 합니다.";
    return null;
  }

  function formatDuration(mins: number): string {
    if (mins % 1440 === 0) return `${mins / 1440}일`;
    return `${mins}분`;
  }

  const initialUnit: DurUnit = valueMinutes % 1440 === 0 ? "days" : "minutes";
  const initialInput = initialUnit === "days" ? valueMinutes / 1440 : valueMinutes;

  const [unit, setUnit] = useState<DurUnit>(initialUnit);
  const [input, setInput] = useState<number>(initialInput);

  useEffect(() => {
    const nextUnit: DurUnit = valueMinutes % 1440 === 0 ? "days" : "minutes";
    setUnit(nextUnit);
    setInput(nextUnit === "days" ? valueMinutes / 1440 : valueMinutes);
  }, [valueMinutes]);

  const minutes = useMemo(() => toMinutes(input, unit), [input, unit]);

  const selectStyle: React.CSSProperties = {
    padding: "9px 38px 9px 10px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,18,32,0.92)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
  };

  const inputStyle: React.CSSProperties = {
    width: 110,
    padding: "9px 10px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,18,32,0.75)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
  };

  const btnStyle: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="number"
        value={input}
        onChange={(e) => setInput(Number(e.target.value))}
        style={inputStyle}
        min={0}
        step={unit === "days" ? 1 : 30}
      />

      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <select value={unit} onChange={(e) => setUnit(e.target.value as DurUnit)} style={selectStyle}>
          <option value="minutes">분</option>
          <option value="days">일</option>
        </select>
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 12,
            pointerEvents: "none",
            fontSize: 12,
            opacity: 0.85,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          ▾
        </span>
      </div>

      <button
        onClick={() => {
          const err = validateMinutes(minutes);
          if (err) return alert(err);
          onApplyMinutes(minutes);
        }}
        style={btnStyle}
      >
        적용
      </button>

      <span style={{ fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.88)" }}>
        {Number.isFinite(minutes) ? `저장: ${minutes}분 (${formatDuration(minutes)})` : ""}
      </span>
    </div>
  );
}
