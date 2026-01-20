// src/pages/owner/OwnerServiceHistoryPage.tsx
import { useEffect, useMemo, useState } from "react";
import {
  adminListAdmins,
  adminListReservationsByRange,
  type AdminReservationRow,
  type AdminUserOption,
  type ReservationStatus,
} from "../../lib/adminReservations";
import { useNavigate } from "react-router-dom";
import "../../styles/ownerHistoryPremium.css";
import {
  ownerListServiceEstimatesByIssuedRange,
  ownerUpsertServiceEstimate,
  type ServiceEstimateRow,
} from "../../lib/ownerEstimates";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toKstFull(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function kstDateStr(iso: string) {
  const dt = new Date(iso);
  const k = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "대기",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소",
  no_show: "노쇼",
};

type StatusFilter = "" | ReservationStatus;
type AssigneeFilter = "" | "unassigned" | string;

type EstimateItem = {
  name: string;
  qty: number;
  unitPrice: number;
};

function money(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ko-KR");
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ✅ 오너 화면 표시용: “작업 단위”로 묶인 행
type OwnerWorkRow = AdminReservationRow & {
  work_id: string;
  work_start_at: string;
  work_end_at: string;
  work_children: number;
  work_service_names: string[];
};

function chooseWorkStatus(list: AdminReservationRow[]): ReservationStatus {
  const st = new Set(list.map((x) => x.status));
  if (st.has("completed")) return "completed";
  if (st.has("confirmed")) return "confirmed";
  if (st.has("pending")) return "pending";
  if (st.has("no_show")) return "no_show";
  if (st.has("canceled")) return "canceled";
  return "pending";
}

function groupToWorks(rows: AdminReservationRow[]): OwnerWorkRow[] {
  const map = new Map<string, AdminReservationRow[]>();

  for (const r of rows) {
    const key = String((r as any).root_reservation_id ?? r.root_reservation_id ?? r.reservation_id);
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }

  const works: OwnerWorkRow[] = [];

  for (const [workId, list] of map.entries()) {
    const sorted = [...list].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const work_start_at = first.scheduled_at;
    const work_end_at = last.scheduled_at;

    const serviceNames = Array.from(new Set(sorted.map((x) => String(x.service_name ?? "")).filter((s) => s.trim().length > 0)));

    const service_name =
      serviceNames.length <= 1 ? (serviceNames[0] ?? first.service_name ?? "정비") : `${serviceNames[0]} 외 ${serviceNames.length - 1}`;

    const lastAssigned = [...sorted]
      .reverse()
      .find((x) => (x.assigned_admin_id ?? "").length > 0 || (x.assigned_admin_label ?? "").length > 0);
    const maxCompleted = [...sorted]
      .filter((x) => x.completed_at)
      .sort((a, b) => new Date(String(a.completed_at)).getTime() - new Date(String(b.completed_at)).getTime())
      .pop();

    const qtyMax = Math.max(
      1,
      ...sorted.map((x) => {
        const q = Number(x.quantity ?? 1);
        return Number.isFinite(q) ? q : 1;
      })
    );

    const workRow: OwnerWorkRow = {
      ...first,

      reservation_id: workId,
      root_reservation_id: workId,

      scheduled_at: work_end_at,

      status: chooseWorkStatus(sorted),
      service_name,

      quantity: qtyMax,

      assigned_admin_id: lastAssigned?.assigned_admin_id ?? first.assigned_admin_id ?? null,
      assigned_admin_label: lastAssigned?.assigned_admin_label ?? first.assigned_admin_label ?? null,

      completed_at: (maxCompleted?.completed_at ?? first.completed_at ?? null) as any,
      completed_admin_id: maxCompleted?.completed_admin_id ?? first.completed_admin_id ?? null,
      completed_admin_label: maxCompleted?.completed_admin_label ?? first.completed_admin_label ?? null,

      work_id: workId,
      work_start_at,
      work_end_at,
      work_children: sorted.length,
      work_service_names: serviceNames,
    };

    works.push(workRow);
  }

  works.sort((a, b) => new Date(b.work_end_at).getTime() - new Date(a.work_end_at).getTime());
  return works;
}

function workRangeLabel(r: OwnerWorkRow) {
  const a = r.work_start_at ?? r.scheduled_at;
  const b = r.work_end_at ?? r.scheduled_at;
  if (!a || !b) return toKstFull(r.scheduled_at);
  const same = kstDateStr(a) === kstDateStr(b);
  if (same) return toKstFull(a);
  return `${toKstFull(a)} ~ ${toKstFull(b)}`;
}

function createUuid() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = (globalThis as any).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {}
  return `est_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function buildEstimateHtml(input: {
  estimateNo?: string;
  issueAtIso: string;
  snapshot: any;
  items: EstimateItem[];
  memo?: string | null;
  totalAmount: number;
  workRangeText?: string;
  statusText?: string;
}) {
  const shopName = "FLAT";
  const shopTel = "010-8233-4946";
  const issueDate = ymd(new Date(input.issueAtIso));
  const snap = input.snapshot ?? {};

  const itemsHtml = (input.items ?? [])
    .map((it) => {
      const qty = Number(it.qty) || 0;
      const unit = Number(it.unitPrice) || 0;
      const line = qty * unit;
      return `
          <tr>
            <td>${escapeHtml(it.name ?? "")}</td>
            <td style="text-align:right;">${escapeHtml(money(qty))}</td>
            <td style="text-align:right;">${escapeHtml(money(unit))}</td>
            <td style="text-align:right;"><b>${escapeHtml(money(line))}</b></td>
          </tr>
        `;
    })
    .join("");

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>견적서</title>
  <style>
    *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;}
    @page { size: A4; margin: 12mm; }
    body{margin:24px;color:#0b0f18;}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;}
    .brand{font-weight:900;font-size:22px;letter-spacing:-0.4px;}
    .sub{opacity:0.8;margin-top:6px;}
    .card{margin-top:18px;border:1px solid #e6e8ee;border-radius:12px;padding:14px;}
    .row{display:flex;gap:14px;flex-wrap:wrap;}
    .col{flex:1;min-width:240px;}
    .label{font-size:12px;opacity:0.7;}
    .val{margin-top:6px;font-weight:800;}
    table{width:100%;border-collapse:collapse;margin-top:12px;}
    th,td{border-bottom:1px solid #eef0f5;padding:10px 8px;font-size:13px;}
    th{text-align:left;background:#f7f8fb;}
    .total{display:flex;justify-content:flex-end;margin-top:10px;font-size:16px;}
    .total b{font-size:20px;margin-left:12px;}
    .memo{margin-top:12px;white-space:pre-wrap;font-size:13px;opacity:0.85;}
    .metaGrid{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;}
    .pill{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid #e6e8ee;background:#fafbff;font-size:12px;font-weight:800;}
    @media print{
      body{margin:0;}
      .card{border:none;padding:0;}
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">${escapeHtml(shopName)} 견적서</div>
      <div class="sub">Tel: ${escapeHtml(shopTel)}</div>
      <div class="metaGrid">
        <span class="pill">발행일: ${escapeHtml(issueDate)}</span>
        ${input.estimateNo ? `<span class="pill">견적번호: ${escapeHtml(input.estimateNo)}</span>` : ""}
      </div>
    </div>
    <div style="text-align:right;">
      <div class="label">작업 ID</div>
      <div class="val">${escapeHtml(String(snap.reservation_id ?? "-"))}</div>
    </div>
  </div>

  <div class="card">
    <div class="row">
      <div class="col">
        <div class="label">고객명</div>
        <div class="val">${escapeHtml(String(snap.full_name ?? "-"))}</div>
      </div>
      <div class="col">
        <div class="label">연락처</div>
        <div class="val">${escapeHtml(String(snap.phone ?? "-"))}</div>
      </div>
      <div class="col">
        <div class="label">차량</div>
        <div class="val">${escapeHtml(String(snap.car_model ?? "-"))}</div>
      </div>
    </div>

    <div class="row" style="margin-top:10px;">
      <div class="col">
        <div class="label">작업일정</div>
        <div class="val">${escapeHtml(String(input.workRangeText ?? (snap.scheduled_at ? toKstFull(String(snap.scheduled_at)) : "-")))}</div>
      </div>
      <div class="col">
        <div class="label">서비스</div>
        <div class="val">${escapeHtml(String(snap.service_name ?? "-"))}</div>
      </div>
      <div class="col">
        <div class="label">상태</div>
        <div class="val">${escapeHtml(String(input.statusText ?? "-"))}</div>
      </div>
    </div>

    <div class="row" style="margin-top:10px;">
      <div class="col">
        <div class="label">담당자</div>
        <div class="val">${escapeHtml(String(snap.assigned_admin_label ?? "미배정"))}</div>
      </div>
      <div class="col">
        <div class="label">합계</div>
        <div class="val">${escapeHtml(money(input.totalAmount))}원</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>항목</th>
          <th style="text-align:right;">수량</th>
          <th style="text-align:right;">단가</th>
          <th style="text-align:right;">금액</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="total">
      합계 <b>${escapeHtml(money(input.totalAmount))}원</b>
    </div>

    ${
      (input.memo ?? "").trim()
        ? `<div class="memo"><div class="label">메모</div>${escapeHtml(String(input.memo))}</div>`
        : ""
    }
  </div>
</body>
</html>
  `.trim();
}

function writeAndPrint(w: Window, html: string) {
  try {
    (w as any).opener = null;
  } catch {}

  w.document.open();
  w.document.write(html);
  w.document.close();

  const doPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {}
  };

  w.onload = () => doPrint();
  setTimeout(() => doPrint(), 500);
}

function openPrintWindow(): Window | null {
  const w = window.open("", "_blank", "width=860,height=920");
  if (!w) {
    alert("팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저에서 팝업 허용 후 다시 시도해주세요.");
    return null;
  }
  return w;
}

export default function OwnerServiceHistoryPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return ymd(d);
  });
  const [endDate, setEndDate] = useState(() => ymd(new Date()));

  const [rows, setRows] = useState<OwnerWorkRow[]>([]);
  const [admins, setAdmins] = useState<AdminUserOption[]>([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [assignee, setAssignee] = useState<AssigneeFilter>("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // ✅ 작업ID(=루트 reservation_id) -> 저장된 견적서(가장 최신)
  const [savedIndex, setSavedIndex] = useState<Record<string, ServiceEstimateRow>>({});

  // 견적서 모달
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimateRes, setEstimateRes] = useState<OwnerWorkRow | null>(null);
  const [estimateItems, setEstimateItems] = useState<EstimateItem[]>([{ name: "공임", qty: 1, unitPrice: 0 }]);
  const [estimateMemo, setEstimateMemo] = useState("");

  // ✅ 저장 상태
  const [estimateSaving, setEstimateSaving] = useState(false);
  const [savedEstimateId, setSavedEstimateId] = useState<string | null>(null);
  const [savedIssuedAt, setSavedIssuedAt] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const list = await adminListAdmins();
        if (!mounted) return;
        setAdmins(list);
      } catch {
        setAdmins([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  function buildSnapshotForSave(r: OwnerWorkRow) {
    return {
      reservation_id: r.reservation_id,
      full_name: r.full_name ?? null,
      phone: r.phone ?? null,
      car_model: r.car_model ?? null,
      service_name: r.service_name ?? null,
      scheduled_at: r.work_end_at ?? r.scheduled_at ?? null,

      work_id: r.work_id,
      work_start_at: r.work_start_at,
      work_end_at: r.work_end_at,
      work_children: r.work_children,
      work_service_names: r.work_service_names ?? [],
      assigned_admin_label: r.assigned_admin_label ?? null,
      assigned_admin_id: r.assigned_admin_id ?? null,
    };
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    try {
      const data = await adminListReservationsByRange(startDate, endDate);
      const works = groupToWorks((data ?? []) as AdminReservationRow[]);
      setRows(works);
      setPage(1);

      // ✅ 이 페이지의 작업ID들에 대해 "저장된 견적서" 여부를 인덱싱
      // 발행일 기준 조회라서 범위를 넉넉히 잡음 (최근 1년)
      const now = new Date();
      const issueStart = (() => {
        const d = new Date(now);
        d.setDate(d.getDate() - 365);
        return ymd(d);
      })();
      const issueEnd = (() => {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        return ymd(d);
      })();

      const estimates = (await ownerListServiceEstimatesByIssuedRange(issueStart, issueEnd)) ?? [];
      const workIdSet = new Set(works.map((w) => String(w.reservation_id)));

      const idx: Record<string, ServiceEstimateRow> = {};
      for (const e of estimates) {
        const rid = String((e as any).reservation_id ?? (e as any).snapshot?.reservation_id ?? "");
        if (!rid) continue;
        if (!workIdSet.has(rid)) continue;

        const prev = idx[rid];
        if (!prev) {
          idx[rid] = e;
          continue;
        }

        const pt = new Date(String((prev as any).issued_at)).getTime();
        const nt = new Date(String((e as any).issued_at)).getTime();
        if (Number.isFinite(nt) && (!Number.isFinite(pt) || nt >= pt)) idx[rid] = e;
      }
      setSavedIndex(idx);
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      setRows([]);
      setSavedIndex({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (status && r.status !== status) return false;

      if (assignee) {
        if (assignee === "unassigned") {
          if (r.assigned_admin_id) return false;
        } else {
          if ((r.assigned_admin_id ?? "") !== assignee) return false;
        }
      }

      if (!qq) return true;

      const hay = [
        r.service_name,
        ...(r.work_service_names ?? []),
        r.full_name ?? "",
        r.phone ?? "",
        r.car_model ?? "",
        r.reservation_id,
        r.assigned_admin_label ?? "",
        r.completed_admin_label ?? "",
        r.work_children ? `분할${r.work_children}` : "",
        savedIndex[r.reservation_id]?.id ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [rows, q, status, assignee, savedIndex]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const pageItems = useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const done = filtered.filter((r) => r.status === "completed").length;
    const pending = filtered.filter((r) => r.status === "pending").length;
    const confirmed = filtered.filter((r) => r.status === "confirmed").length;
    const canceled = filtered.filter((r) => r.status === "canceled").length;
    const noShow = filtered.filter((r) => r.status === "no_show").length;
    return { total, done, pending, confirmed, canceled, noShow };
  }, [filtered]);

  function goToOps(r: OwnerWorkRow) {
    const ds = kstDateStr(r.work_end_at ?? r.scheduled_at);
    const qs = new URLSearchParams();
    qs.set("date", ds);
    qs.set("tab", "schedule");
    qs.set("focus", r.reservation_id);
    nav(`/admin?${qs.toString()}`);
  }

  function openEstimate(r: OwnerWorkRow) {
    const saved = savedIndex[String(r.reservation_id)] ?? null;

    setEstimateRes(r);

    if (saved) {
      // ✅ 저장된 견적서가 있으면: 편집 모드로 로드
      const items = Array.isArray((saved as any).items) ? ((saved as any).items as EstimateItem[]) : [];
      setEstimateItems(
        items.length
          ? items
          : [
              { name: r.service_name || "정비 항목", qty: Math.max(1, Number(r.quantity ?? 1)), unitPrice: 0 },
              { name: "공임", qty: 1, unitPrice: 0 },
            ]
      );
      setEstimateMemo(String((saved as any).memo ?? ""));
      setSavedEstimateId(String((saved as any).id ?? ""));
      setSavedIssuedAt((saved as any).issued_at ? String((saved as any).issued_at) : null);
    } else {
      // ✅ 저장된 견적서가 없으면: 신규 생성 모드
      setEstimateItems([
        { name: r.service_name || "정비 항목", qty: Math.max(1, Number(r.quantity ?? 1)), unitPrice: 0 },
        { name: "공임", qty: 1, unitPrice: 0 },
      ]);
      setEstimateMemo("");
      setSavedEstimateId(null);
      setSavedIssuedAt(null);
    }

    setMsg(null);
    setEstimateOpen(true);
  }

  const estimateTotal = useMemo(() => {
    return estimateItems.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  }, [estimateItems]);

  async function saveEstimateOnly(): Promise<ServiceEstimateRow | null> {
    if (!estimateRes) return null;

    const id = savedEstimateId ?? createUuid();
    const snapshot = buildSnapshotForSave(estimateRes);

    try {
      setEstimateSaving(true);
      setMsg(null);

      const saved = (await ownerUpsertServiceEstimate({
        id,
        reservationId: estimateRes.reservation_id,
        snapshot,
        items: estimateItems,
        memo: estimateMemo,
        totalAmount: estimateTotal,
      })) as ServiceEstimateRow;

      const sid = String((saved as any)?.id ?? id);
      const issued = (saved as any)?.issued_at ? String((saved as any).issued_at) : null;

      setSavedEstimateId(sid);
      setSavedIssuedAt(issued);

      // ✅ 목록에서 "저장됨"으로 즉시 표시되도록 인덱스 갱신
      setSavedIndex((prev) => ({
        ...prev,
        [String(estimateRes.reservation_id)]: saved,
      }));

      return saved;
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      return null;
    } finally {
      setEstimateSaving(false);
    }
  }

  async function saveAndPrint() {
    if (!estimateRes) return;

    const w = openPrintWindow();
    if (!w) return;

    const saved = await saveEstimateOnly();
    if (!saved) {
      try {
        w.close();
      } catch {}
      return;
    }

    const snapshot = buildSnapshotForSave(estimateRes);
    const html = buildEstimateHtml({
      estimateNo: String((saved as any).id ?? savedEstimateId ?? undefined),
      issueAtIso: (saved as any).issued_at ? String((saved as any).issued_at) : new Date().toISOString(),
      snapshot: { ...snapshot, assigned_admin_label: estimateRes.assigned_admin_label ?? "미배정" },
      items: estimateItems,
      memo: estimateMemo,
      totalAmount: estimateTotal,
      workRangeText: workRangeLabel(estimateRes),
      statusText: STATUS_LABEL[estimateRes.status],
    });

    writeAndPrint(w, html);
  }

  function printOnly() {
    if (!estimateRes) return;

    const w = openPrintWindow();
    if (!w) return;

    const snapshot = buildSnapshotForSave(estimateRes);
    const html = buildEstimateHtml({
      estimateNo: savedEstimateId ?? undefined,
      issueAtIso: savedIssuedAt ?? new Date().toISOString(),
      snapshot: { ...snapshot, assigned_admin_label: estimateRes.assigned_admin_label ?? "미배정" },
      items: estimateItems,
      memo: estimateMemo,
      totalAmount: estimateTotal,
      workRangeText: workRangeLabel(estimateRes),
      statusText: STATUS_LABEL[estimateRes.status],
    });

    writeAndPrint(w, html);
  }

  return (
    <div className="ohShell">
      <div className="ohBg" aria-hidden />

      <div className="ohTop">
        <div className="ohTitle">
          <div className="ohTitleMain">오너 · 전체 정비 내역</div>
          <div className="ohTitleSub">기간/상태/담당자/검색 · (장기수리=1작업) · 선택 후 견적서 생성</div>
        </div>

        <div className="ohTopActions">
          <button className="ohBtn" onClick={load} disabled={loading} type="button">
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>
      </div>

      <div className="ohFilters">
        <div className="ohField">
          <div className="ohLabel">시작</div>
          <input className="ohInput" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div className="ohField">
          <div className="ohLabel">종료</div>
          <input className="ohInput" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="ohField">
          <div className="ohLabel">상태</div>
          <select className="ohInput" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="">전체</option>
            {(["pending", "confirmed", "completed", "canceled", "no_show"] as ReservationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="ohField">
          <div className="ohLabel">담당자</div>
          <select className="ohInput" value={assignee} onChange={(e) => setAssignee(e.target.value as AssigneeFilter)}>
            <option value="">전체</option>
            <option value="unassigned">미배정</option>
            {admins.map((a) => (
              <option key={a.user_id} value={a.user_id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ohField ohFieldWide">
          <div className="ohLabel">검색</div>
          <input className="ohInput" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름/전화/차량/서비스/작업ID/담당자/견적번호" />
        </div>

        <button className="ohBtnGhost" onClick={load} disabled={loading} type="button">
          적용
        </button>
      </div>

      <div className="ohHint">
        <span className="ohChip">총 {stats.total}건</span>
        <span className="ohChip ohChipOk">완료 {stats.done}</span>
        <span className="ohChip">대기 {stats.pending}</span>
        <span className="ohChip">확정 {stats.confirmed}</span>
        <span className="ohChip ohChipDanger">취소 {stats.canceled}</span>
        <span className="ohChip ohChipDanger">노쇼 {stats.noShow}</span>
        {msg ? <span className="ohMsg">{msg}</span> : null}
      </div>

      <div className="ohList">
        {pageItems.length ? (
          pageItems.map((r) => {
            const saved = savedIndex[String(r.reservation_id)] ?? null;

            return (
              <div key={r.work_id} className="ohRow">
                <div className="ohRowMain">
                  <div className="ohRowTitle">
                    <span className="ohService">{r.service_name}</span>
                    <span className={`ohStatus ohStatus--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    {saved ? (
                      <span className="ohChip ohChipOk" style={{ marginLeft: 10 }}>
                        저장됨
                      </span>
                    ) : (
                      <span className="ohChip" style={{ marginLeft: 10, opacity: 0.85 }}>
                        미저장
                      </span>
                    )}
                  </div>

                  <div className="ohRowSub">
                    <span>작업: {workRangeLabel(r)}</span>
                    {r.work_children > 1 ? (
                      <>
                        <span className="ohDot">·</span>
                        <span>분할 {r.work_children}회</span>
                      </>
                    ) : null}
                  </div>

                  <div className="ohRowSub">
                    <span>고객: {r.full_name ?? "-"}</span>
                    <span className="ohDot">·</span>
                    <span>전화: {r.phone ?? "-"}</span>
                    <span className="ohDot">·</span>
                    <span>차량: {r.car_model ?? "-"}</span>
                  </div>

                  <div className="ohRowSub2">
                    <span>담당자: {r.assigned_admin_label ?? "미배정"}</span>
                    <span className="ohDot">·</span>
                    <span>완료자: {r.completed_admin_label ?? "-"}</span>
                    <span className="ohDot">·</span>
                    <span>완료시각: {r.completed_at ? toKstFull(r.completed_at) : "-"}</span>
                    {saved ? (
                      <>
                        <span className="ohDot">·</span>
                        <span style={{ opacity: 0.85 }}>견적번호: {String((saved as any).id ?? "-")}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="ohRowActions">
                  <button className="ohBtnGhost" onClick={() => goToOps(r)} title="운영 화면에서 보기" type="button">
                    운영 →
                  </button>
                  <button className="ohBtn" onClick={() => openEstimate(r)} title={saved ? "저장된 견적서 편집" : "견적서 만들기"} type="button">
                    {saved ? "견적서 편집" : "견적서"}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="ohEmpty">{loading ? "불러오는 중..." : "데이터가 없습니다."}</div>
        )}
      </div>

      <div className="ohPager">
        <button className="ohBtnGhost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} type="button">
          이전
        </button>
        <div className="ohPagerInfo">
          {page} / {totalPages}
        </div>
        <button className="ohBtnGhost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} type="button">
          다음
        </button>
      </div>

      {/* 견적서 모달 */}
      {estimateOpen && estimateRes ? (
        <div
          className="ohModalBackdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEstimateOpen(false);
          }}
        >
          <div className="ohModal">
            <div className="ohModalHead">
              <div>
                <div className="ohModalTitle">{savedEstimateId ? "견적서 편집" : "견적서 만들기"}</div>
                <div className="ohModalSub">
                  {estimateRes.full_name ?? "-"} · {estimateRes.phone ?? "-"} · {workRangeLabel(estimateRes)}
                </div>
                {savedEstimateId ? (
                  <div className="ohModalSub" style={{ marginTop: 6, opacity: 0.92 }}>
                    저장됨 · 견적번호 {savedEstimateId}
                    {savedIssuedAt ? ` · ${toKstFull(savedIssuedAt)}` : ""}
                  </div>
                ) : (
                  <div className="ohModalSub" style={{ marginTop: 6, opacity: 0.8 }}>
                    아직 저장되지 않았습니다
                  </div>
                )}
              </div>
              <button className="ohIconBtn" onClick={() => setEstimateOpen(false)} aria-label="닫기" type="button">
                ✕
              </button>
            </div>

            <div className="ohModalBody">
              <div className="ohEstimateGrid">
                <div className="ohCard">
                  <div className="ohCardTitle">기본 정보</div>
                  <div className="ohKV">
                    <div>
                      <div className="ohK">작업ID</div>
                      <div className="ohV">{estimateRes.reservation_id}</div>
                    </div>
                    <div>
                      <div className="ohK">상태</div>
                      <div className="ohV">{STATUS_LABEL[estimateRes.status]}</div>
                    </div>
                    <div>
                      <div className="ohK">담당자</div>
                      <div className="ohV">{estimateRes.assigned_admin_label ?? "미배정"}</div>
                    </div>
                    <div>
                      <div className="ohK">차량</div>
                      <div className="ohV">{estimateRes.car_model ?? "-"}</div>
                    </div>
                  </div>
                </div>

                <div className="ohCard">
                  <div className="ohCardTitle">견적 항목</div>

                  <div className="ohItems">
                    {estimateItems.map((it, idx) => (
                      <div key={idx} className="ohItemRow">
                        <input
                          className="ohInput"
                          value={it.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEstimateItems((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)));
                          }}
                          placeholder="항목명"
                        />

                        <input
                          className="ohInput"
                          type="number"
                          min={0}
                          value={it.qty}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setEstimateItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: Number.isFinite(v) ? v : 0 } : x)));
                          }}
                          placeholder="수량"
                        />

                        <input
                          className="ohInput"
                          type="number"
                          min={0}
                          value={it.unitPrice}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setEstimateItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: Number.isFinite(v) ? v : 0 } : x)));
                          }}
                          placeholder="단가"
                        />

                        <div className="ohLineSum">{money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}원</div>

                        <button className="ohBtnDanger" type="button" onClick={() => setEstimateItems((prev) => prev.filter((_, i) => i !== idx))} title="삭제">
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="ohItemActions">
                    <button className="ohBtnGhost" type="button" onClick={() => setEstimateItems((prev) => [...prev, { name: "부품", qty: 1, unitPrice: 0 }])}>
                      + 항목 추가
                    </button>

                    <div className="ohTotal">
                      합계 <b>{money(estimateTotal)}원</b>
                    </div>
                  </div>

                  <div className="ohField" style={{ marginTop: 12 }}>
                    <div className="ohLabel">메모</div>
                    <textarea
                      className="ohTextarea"
                      value={estimateMemo}
                      onChange={(e) => setEstimateMemo(e.target.value)}
                      placeholder="예: 타이어 4본 교체, 얼라인먼트 포함, 부품 보증 6개월..."
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="ohModalFoot">
              <button className="ohBtnGhost" onClick={() => setEstimateOpen(false)} type="button" disabled={estimateSaving}>
                닫기
              </button>

              <button className="ohBtnGhost" onClick={printOnly} type="button" disabled={estimateSaving}>
                인쇄만
              </button>

              <button className="ohBtnGhost" onClick={saveEstimateOnly} type="button" disabled={estimateSaving}>
                {estimateSaving ? "저장중..." : "저장만"}
              </button>

              <button className="ohBtn" onClick={saveAndPrint} type="button" disabled={estimateSaving}>
                {estimateSaving ? "저장중..." : "저장 후 인쇄/저장(PDF)"}
              </button>
            </div>

            {savedEstimateId ? (
              <div style={{ padding: "0 14px 14px 14px" }}>
                <button className="ohBtnGhost" type="button" onClick={() => nav("/owner/estimates")} style={{ width: "100%" }}>
                  견적서 관리로 이동 →
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
