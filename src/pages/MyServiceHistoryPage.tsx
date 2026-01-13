// src/pages/MyServiceHistoryPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { myListServiceHistory, type MyServiceHistoryRow } from "../lib/myHistory";

function fmtKST(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeStyle(kind: "ok" | "warn" | "info" | "danger"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.92)",
    background: "rgba(255,255,255,0.06)",
    whiteSpace: "nowrap",
  };
  if (kind === "ok") return { ...base, border: "1px solid rgba(110,231,183,0.28)", background: "rgba(110,231,183,0.10)" };
  if (kind === "warn") return { ...base, border: "1px solid rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.10)" };
  if (kind === "danger") return { ...base, border: "1px solid rgba(251,113,133,0.30)", background: "rgba(251,113,133,0.12)" };
  return base;
}

function statusLabel(status: string) {
  if (status === "pending") return "대기";
  if (status === "confirmed") return "확정";
  if (status === "completed") return "완료";
  if (status === "canceled") return "취소";
  if (status === "no_show") return "노쇼";
  return status;
}

function statusKind(status: string): "ok" | "warn" | "info" | "danger" {
  if (status === "completed") return "ok";
  if (status === "confirmed") return "warn";
  if (status === "canceled" || status === "no_show") return "danger";
  return "info";
}

function safeStr(v: any) {
  return (v ?? "").toString().trim();
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export default function MyServiceHistoryPage() {
  const styles = useMemo(() => {
    const bg: CSSProperties = {
      position: "fixed",
      inset: 0,
      zIndex: -1,
      background:
        "radial-gradient(900px 420px at 18% 8%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(800px 420px at 82% 12%, rgba(255,255,255,0.07), transparent 62%), linear-gradient(180deg, #0b1220, #070b14)",
    };

    const shell: CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: 12 };
    const h1: CSSProperties = { margin: "4px 0 10px 0", color: "rgba(255,255,255,0.94)", fontWeight: 950, letterSpacing: "-0.6px" };

    const glass: CSSProperties = {
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 18,
      background: "rgba(255,255,255,0.05)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
      overflow: "hidden",
    };

    const topbar: CSSProperties = {
      padding: 12,
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
    };

    const controlRow: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" };

    const label: CSSProperties = { fontSize: 12, opacity: 0.78, color: "rgba(255,255,255,0.90)" };

    const input: CSSProperties = {
      padding: "11px 12px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(12,18,32,0.75)",
      color: "rgba(255,255,255,0.92)",
      outline: "none",
      boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
      cursor: "pointer",
    };

    const btn: CSSProperties = {
      padding: "11px 14px",
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 900,
      cursor: "pointer",
    };

    const listWrap: CSSProperties = { padding: 12, display: "grid", gap: 10 };

    const card: CSSProperties = {
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      boxShadow: "0 14px 34px rgba(0,0,0,0.30)",
      padding: 12,
      display: "grid",
      gap: 8,
    };

    const title: CSSProperties = { fontWeight: 950, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.3px" };
    const mono: CSSProperties = { fontSize: 12, opacity: 0.82, color: "rgba(255,255,255,0.90)" };
    const muted: CSSProperties = { fontSize: 12, opacity: 0.70, color: "rgba(255,255,255,0.86)" };

    return { bg, shell, h1, glass, topbar, controlRow, label, input, btn, listWrap, card, title, mono, muted };
  }, []);

  const [onlyCompleted, setOnlyCompleted] = useState(true);
  const [limit, setLimit] = useState(50);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<MyServiceHistoryRow[]>([]);

  /**
   * ✅ “5일 작업(540분 x N)”이 여러 row로 내려오면, 한 카드로 합치기
   * - 베스트: root_reservation_id 같은 그룹키가 내려오면 그걸로 묶음
   * - 없으면: (service_name/problem/insurance/quantity/admin_note + status + completed_at) 기준으로 묶고,
   *          날짜가 띄엄띄엄이어도 같은 작업이면 한 덩어리로 합침
   * - 오탐 방지: 최소 3건 이상일 때만 “분할 작업”으로 그룹화
   */
  const displayRows = useMemo(() => {
    const src = [...rows].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    const getRootKey = (r: MyServiceHistoryRow) => {
      const anyR = r as any;
      return (
        anyR.root_reservation_id ??
        anyR.rootReservationId ??
        anyR.root_id ??
        anyR.batch_id ??
        anyR.group_id ??
        anyR.bundle_id ??
        null
      );
    };

    const isWorkdayChunk = (r: MyServiceHistoryRow) => Number(r.duration_minutes) === 540;

    const baseKey = (r: MyServiceHistoryRow) => {
      // 가능한 필드만으로 “같은 작업” 판별 키
      // (service_item_id가 있으면 더 정확해짐)
      const anyR = r as any;
      return [
        safeStr(anyR.service_item_id),
        safeStr(r.service_name),
        safeStr(r.problem),
        String(!!r.insurance),
        safeStr(r.quantity),
        safeStr(r.admin_note),
      ].join("|");
    };

    const withMeta = (
      rep: MyServiceHistoryRow,
      groupKey: string,
      group: MyServiceHistoryRow[],
    ) => {
      const sorted = [...group].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      return {
        ...(rep as any),
        __group_key: groupKey,
        __group_count: sorted.length,
        __range_start_iso: sorted[0].scheduled_at,
        __range_end_iso: sorted[sorted.length - 1].scheduled_at,
      } as MyServiceHistoryRow & {
        __group_key: string;
        __group_count: number;
        __range_start_iso: string;
        __range_end_iso: string;
      };
    };

    const used = new Set<string>();
    const out: Array<
      MyServiceHistoryRow & {
        __group_key: string;
        __group_count: number;
        __range_start_iso: string;
        __range_end_iso: string;
      }
    > = [];

    // 1) rootKey로 그룹(있으면 최우선)
    const rootMap = new Map<string, MyServiceHistoryRow[]>();
    for (const r of src) {
      const root = getRootKey(r);
      if (!root) continue;
      const key = String(root);
      const arr = rootMap.get(key) ?? [];
      arr.push(r);
      rootMap.set(key, arr);
    }

    for (const [key, group] of rootMap.entries()) {
      for (const r of group) used.add(r.reservation_id);
      const rep = [...group].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
      out.push(withMeta(rep, `root:${key}`, group));
    }

    // 2) rootKey가 없는 경우: “분할 작업(540분)”을 heuristic으로 묶기
    //    - completed_at이 동일하면 같은 작업일 확률이 높음(특히 완료 화면)
    //    - 날짜 갭이 있어도 묶는다(차단/주말/용량FULL 때문에).
    const heurMap = new Map<string, MyServiceHistoryRow[]>();
    for (const r of src) {
      if (used.has(r.reservation_id)) continue;
      if (!isWorkdayChunk(r)) continue;

      const anyR = r as any;
      const completedKey = safeStr(anyR.completed_at ?? (r as any).completed_at ?? "");
      const key = ["heur", baseKey(r), safeStr(r.status), completedKey].join("::");
      const arr = heurMap.get(key) ?? [];
      arr.push(r);
      heurMap.set(key, arr);
    }

    // 그룹 확정(최소 3건 이상만)
    const heurGroupedIds = new Set<string>();
    for (const [key, group] of heurMap.entries()) {
      if (group.length < 3) continue; // 오탐 방지: 2건은 보통 그냥 별개 예약일 확률 ↑

      // 너무 긴 기간(예: 2달)까지 묶이는 사고 방지
      const sorted = [...group].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      const spanDays = Math.round(
        (new Date(sorted[sorted.length - 1].scheduled_at).getTime() - new Date(sorted[0].scheduled_at).getTime()) / (24 * 60 * 60 * 1000),
      );
      if (spanDays > 45) continue;

      for (const r of group) {
        used.add(r.reservation_id);
        heurGroupedIds.add(r.reservation_id);
      }
      const rep = sorted[0];
      out.push(withMeta(rep, key, group));
    }

    // 3) 나머지는 단건으로
    for (const r of src) {
      if (used.has(r.reservation_id)) continue;
      used.add(r.reservation_id);
      out.push(withMeta(r, `single:${r.reservation_id}`, [r]));
    }

    // 최신순
    out.sort((a, b) => new Date(b.__range_start_iso).getTime() - new Date(a.__range_start_iso).getTime());

    return out;
  }, [rows]);

  async function refresh() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await myListServiceHistory({ limit, onlyCompleted });
      setRows(list);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyCompleted, limit]);

  return (
    <div style={styles.shell}>
      <div style={styles.bg} aria-hidden />
      <h2 style={styles.h1}>내 정비 내역</h2>

      <div style={styles.glass}>
        <div style={styles.topbar}>
          <div style={styles.controlRow}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={styles.label}>보기</span>
              <select
                value={onlyCompleted ? "completed" : "all"}
                onChange={(e) => setOnlyCompleted(e.target.value === "completed")}
                style={styles.input}
              >
                <option value="completed">완료만</option>
                <option value="all">전체</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={styles.label}>최대 표시</span>
              <select value={String(limit)} onChange={(e) => setLimit(clampInt(Number(e.target.value), 1, 500))} style={styles.input}>
                {[20, 50, 100, 200].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}건
                  </option>
                ))}
              </select>
            </label>

            <button onClick={refresh} disabled={loading} style={{ ...styles.btn, opacity: loading ? 0.65 : 1 }}>
              {loading ? "불러오는 중..." : "새로고침"}
            </button>
          </div>

          <div style={badgeStyle("info")}>총 {displayRows.length}건</div>
        </div>

        <div style={styles.listWrap}>
          {errorMsg ? <div style={{ ...styles.card, border: "1px solid rgba(251,113,133,0.35)" }}>오류: {errorMsg}</div> : null}

          {!loading && displayRows.length === 0 ? (
            <div style={styles.card}>
              <div style={styles.title}>내역이 없습니다</div>
              <div style={styles.muted}>예약을 진행하면 여기에 정비 내역이 쌓입니다.</div>
            </div>
          ) : null}

          {displayRows.map((r) => {
            const groupCount = Math.max(1, Number((r as any).__group_count ?? 1));
            const rangeStart = String((r as any).__range_start_iso ?? r.scheduled_at);
            const rangeEnd = String((r as any).__range_end_iso ?? r.scheduled_at);
            const key = String((r as any).__group_key ?? r.reservation_id);

            const showRange = groupCount > 1;

            return (
              <div key={key} style={styles.card}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={styles.title}>{r.service_name}</div>
                  <span style={badgeStyle(statusKind(r.status))}>{statusLabel(r.status)}</span>

                  {groupCount > 1 ? <span style={badgeStyle("warn")}>분할 작업({groupCount}건)</span> : null}

                  <span style={badgeStyle("info")}>
                    {r.duration_minutes}분{typeof r.quantity === "number" ? ` · 수량 ${r.quantity}` : ""}
                  </span>
                </div>

                <div style={styles.mono}>
                  {showRange ? (
                    <>
                      작업기간: {fmtKST(rangeStart)} ~ {fmtKST(rangeEnd)}
                      {r.completed_at ? ` · 완료: ${fmtKST(r.completed_at)}` : ""}
                    </>
                  ) : (
                    <>
                      예약시간: {fmtKST(r.scheduled_at)}
                      {r.completed_at ? ` · 완료: ${fmtKST(r.completed_at)}` : ""}
                    </>
                  )}
                </div>

                <div style={styles.muted}>
                  증상: {r.problem ?? "-"} · 보험: {r.insurance ? "적용" : "미적용"}
                </div>

                {r.admin_note ? <div style={styles.muted}>관리자 메모: {r.admin_note}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
