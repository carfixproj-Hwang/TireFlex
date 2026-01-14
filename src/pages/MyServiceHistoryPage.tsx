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

function addMinutesIso(iso: string, mins: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
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

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function pickGroupStatus(statuses: string[]) {
  // 진행중이 하나라도 있으면 그쪽이 우선
  if (statuses.some((s) => s === "pending")) return "pending";
  if (statuses.some((s) => s === "confirmed")) return "confirmed";
  if (statuses.some((s) => s === "completed")) return "completed";
  if (statuses.some((s) => s === "canceled")) return "canceled";
  if (statuses.some((s) => s === "no_show")) return "no_show";
  return statuses[0] ?? "unknown";
}

type DisplayRow = MyServiceHistoryRow & {
  __group_key: string;
  __group_count: number;
  __total_duration_minutes: number;
  __range_start_iso: string;
  __range_end_iso: string;
  __group_status: string;
  __group_completed_at: string | null;
};

type ViewMode = "booking" | "completed" | "all";

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

  // ✅ 기본값: 예약
  const [viewMode, setViewMode] = useState<ViewMode>("booking");
  const [limit, setLimit] = useState(50);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<MyServiceHistoryRow[]>([]);

  // ✅ root_reservation_id(있으면) 기준으로 묶어서 “5일짜리 1카드”
  const groupedRows = useMemo<DisplayRow[]>(() => {
    const groups = new Map<string, MyServiceHistoryRow[]>();

    for (const r of rows) {
      const key = (r as any).root_reservation_id ?? r.reservation_id; // 타입/런타임 둘다 안전하게
      const k = String(key);
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const out: DisplayRow[] = [];

    for (const [k, arr] of groups.entries()) {
      const sorted = [...arr].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

      const totalDur = sorted.reduce((sum, x) => sum + Number(x.duration_minutes || 0), 0);

      const rangeStart = sorted[0]?.scheduled_at ?? "";
      let rangeEnd = rangeStart;

      let latestEndMs = -Infinity;
      for (const x of sorted) {
        const endIso = addMinutesIso(x.scheduled_at, x.duration_minutes);
        const ms = new Date(endIso).getTime();
        if (ms > latestEndMs) {
          latestEndMs = ms;
          rangeEnd = endIso;
        }
      }

      const statuses = sorted.map((x) => x.status);
      const groupStatus = pickGroupStatus(statuses);

      const completedCandidates = sorted
        .map((x) => x.completed_at)
        .filter((v): v is string => !!v)
        .map((v) => new Date(v).getTime());
      const groupCompletedAt = completedCandidates.length > 0 ? new Date(Math.max(...completedCandidates)).toISOString() : null;

      const rep = sorted[0];

      out.push({
        ...rep,
        __group_key: k,
        __group_count: sorted.length,
        __total_duration_minutes: totalDur,
        __range_start_iso: rangeStart,
        __range_end_iso: rangeEnd,
        __group_status: groupStatus,
        __group_completed_at: groupCompletedAt,
      });
    }

    out.sort((a, b) => new Date(b.__range_start_iso).getTime() - new Date(a.__range_start_iso).getTime());
    return out;
  }, [rows]);

  // ✅ 보기(전체/예약/완료) 필터는 “그룹 상태” 기준으로 적용
  const displayRows = useMemo(() => {
    if (viewMode === "all") return groupedRows;
    if (viewMode === "completed") return groupedRows.filter((g) => g.__group_status === "completed");
    // booking
    return groupedRows.filter((g) => g.__group_status === "pending" || g.__group_status === "confirmed");
  }, [groupedRows, viewMode]);

  function durationLabel(g: DisplayRow) {
    const cnt = g.__group_count;
    if (cnt <= 1) return `${g.duration_minutes}분`;

    // 하루 작업(540분) 분할이 누적된 형태면 “n일”로 보여주기
    const WORKDAY = 540;
    const total = g.__total_duration_minutes;
    if (total >= WORKDAY * 2 && total % WORKDAY === 0) {
      const days = total / WORKDAY;
      return `${days}일 작업(분할 ${cnt}건)`;
    }
    return `총 ${total}분(분할 ${cnt}건)`;
  }

  async function refresh() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // ✅ 완료 보기일 때만 서버에 completed만 요청(가벼움)
      const onlyCompleted = viewMode === "completed";
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
  }, [viewMode, limit]);

  return (
    <div style={styles.shell}>
      <div style={styles.bg} aria-hidden />
      <h2 style={styles.h1}>내 정비 내역</h2>

      <div style={styles.glass}>
        <div style={styles.topbar}>
          <div style={styles.controlRow}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={styles.label}>보기</span>
              <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} style={styles.input}>
                <option value="booking">예약</option>
                <option value="completed">완료</option>
                <option value="all">전체</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={styles.label}>최대 표시</span>
              <select
                value={String(limit)}
                onChange={(e) => setLimit(clampInt(Number(e.target.value), 1, 200))}
                style={styles.input}
              >
                {[20, 50, 100, 200].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}건
                  </option>
                ))}
              </select>
            </label>

            {/* <button onClick={refresh} disabled={loading} style={{ ...styles.btn, opacity: loading ? 0.65 : 1 }}>
              {loading ? "불러오는 중..." : "새로고침"}
            </button> */}
          </div>

          <div style={badgeStyle("info")}>총 {displayRows.length}건</div>
        </div>

        <div style={styles.listWrap}>
          {errorMsg ? <div style={{ ...styles.card, border: "1px solid rgba(251,113,133,0.35)" }}>오류: {errorMsg}</div> : null}

          {!loading && displayRows.length === 0 ? (
            <div style={styles.card}>
              <div style={styles.title}>내역이 없습니다</div>
              <div style={styles.muted}>
                {viewMode === "booking" ? "현재 예약 내역이 없습니다." : viewMode === "completed" ? "완료 내역이 없습니다." : "전체 내역이 없습니다."}
              </div>
            </div>
          ) : null}

          {displayRows.map((g) => {
            const st = g.__group_status;
            const doneAt = g.__group_completed_at;

            const showGrouped = g.__group_count > 1;

            return (
              <div key={g.__group_key} style={styles.card}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={styles.title}>{g.service_name}</div>
                  <span style={badgeStyle(statusKind(st))}>{statusLabel(st)}</span>

                  <span style={badgeStyle(showGrouped ? "warn" : "info")}>
                    {durationLabel(g)}
                    {typeof g.quantity === "number" ? ` · 수량 ${g.quantity}` : ""}
                  </span>
                </div>

                <div style={styles.mono}>
                  {showGrouped ? (
                    <>
                      작업기간: {fmtKST(g.__range_start_iso)} ~ {fmtKST(g.__range_end_iso)}
                      {doneAt ? ` · 완료: ${fmtKST(doneAt)}` : ""}
                    </>
                  ) : (
                    <>
                      예약시간: {fmtKST(g.scheduled_at)}
                      {doneAt ? ` · 완료: ${fmtKST(doneAt)}` : ""}
                    </>
                  )}
                </div>

                <div style={styles.muted}>증상: {g.problem ?? "-"} · 보험: {g.insurance ? "적용" : "미적용"}</div>

                {g.admin_note ? <div style={styles.muted}>관리자 메모: {g.admin_note}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
