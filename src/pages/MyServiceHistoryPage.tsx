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
              <select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} style={styles.input}>
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

          <div style={badgeStyle("info")}>총 {rows.length}건</div>
        </div>

        <div style={styles.listWrap}>
          {errorMsg ? <div style={{ ...styles.card, border: "1px solid rgba(251,113,133,0.35)" }}>오류: {errorMsg}</div> : null}

          {!loading && rows.length === 0 ? (
            <div style={styles.card}>
              <div style={styles.title}>내역이 없습니다</div>
              <div style={styles.muted}>예약을 진행하면 여기에 정비 내역이 쌓입니다.</div>
            </div>
          ) : null}

          {rows.map((r) => (
            <div key={r.reservation_id} style={styles.card}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={styles.title}>{r.service_name}</div>
                <span style={badgeStyle(statusKind(r.status))}>{statusLabel(r.status)}</span>
                <span style={badgeStyle("info")}>
                  {r.duration_minutes}분{typeof r.quantity === "number" ? ` · 수량 ${r.quantity}` : ""}
                </span>
              </div>

              <div style={styles.mono}>
                예약시간: {fmtKST(r.scheduled_at)}
                {r.completed_at ? ` · 완료: ${fmtKST(r.completed_at)}` : ""}
              </div>

              <div style={styles.muted}>
                증상: {r.problem ?? "-"} · 보험: {r.insurance ? "적용" : "미적용"}
              </div>

              {r.admin_note ? <div style={styles.muted}>관리자 메모: {r.admin_note}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
