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

// ✅ 오너 화면 표시용: “작업 단위”로 묶인 행
type OwnerWorkRow = AdminReservationRow & {
  work_id: string;
  work_start_at: string;
  work_end_at: string;
  work_children: number;
  work_service_names: string[];
};

function chooseWorkStatus(list: AdminReservationRow[]): ReservationStatus {
  // 완료가 하나라도 있으면 완료, 아니면 확정/대기 우선, 그 외 노쇼/취소
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

    const serviceNames = Array.from(
      new Set(sorted.map((x) => String(x.service_name ?? "")).filter((s) => s.trim().length > 0))
    );

    const service_name =
      serviceNames.length <= 1 ? (serviceNames[0] ?? first.service_name ?? "정비") : `${serviceNames[0]} 외 ${serviceNames.length - 1}`;

    const lastAssigned = [...sorted].reverse().find((x) => (x.assigned_admin_id ?? "").length > 0 || (x.assigned_admin_label ?? "").length > 0);
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

      // ✅ 대표키는 “작업ID(루트)”로 고정
      reservation_id: workId,
      root_reservation_id: workId,

      // ✅ 대표 일시는 마지막 일정(최근 기준으로 정렬/표시)
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

  // 최근 작업이 위로
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

  // ✅ 작업 단위 행
  const [rows, setRows] = useState<OwnerWorkRow[]>([]);
  const [admins, setAdmins] = useState<AdminUserOption[]>([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [assignee, setAssignee] = useState<AssigneeFilter>("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 견적서 모달
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimateRes, setEstimateRes] = useState<OwnerWorkRow | null>(null);
  const [estimateItems, setEstimateItems] = useState<EstimateItem[]>([{ name: "공임", qty: 1, unitPrice: 0 }]);
  const [estimateMemo, setEstimateMemo] = useState("");

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

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const data = await adminListReservationsByRange(startDate, endDate);

      // ✅ 장기수리(분할) → 작업 단위로 묶기
      const works = groupToWorks((data ?? []) as AdminReservationRow[]);
      setRows(works);
      setPage(1);
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
        r.reservation_id, // work_id
        r.assigned_admin_label ?? "",
        r.completed_admin_label ?? "",
        r.work_children ? `분할${r.work_children}` : "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [rows, q, status, assignee]);

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
    // ✅ 작업의 마지막 일정 날짜로 운영 화면 이동
    const ds = kstDateStr(r.work_end_at ?? r.scheduled_at);
    const qs = new URLSearchParams();
    qs.set("date", ds);
    qs.set("tab", "schedule");
    // focus는 work_id(루트)로
    qs.set("focus", r.reservation_id);
    nav(`/admin?${qs.toString()}`);
  }

  function openEstimate(r: OwnerWorkRow) {
    setEstimateRes(r);
    setEstimateItems([
      { name: r.service_name || "정비 항목", qty: Math.max(1, Number(r.quantity ?? 1)), unitPrice: 0 },
      { name: "공임", qty: 1, unitPrice: 0 },
    ]);
    setEstimateMemo("");
    setEstimateOpen(true);
  }

  const estimateTotal = useMemo(() => {
    return estimateItems.reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  }, [estimateItems]);

  function printEstimate() {
    if (!estimateRes) return;

    const shopName = "TIRE FLEX";
    const shopTel = "031-355-0018";
    const issueDate = ymd(new Date());

    const itemsHtml = estimateItems
      .map((it) => {
        const qty = Number(it.qty) || 0;
        const unit = Number(it.unitPrice) || 0;
        const line = qty * unit;
        return `
          <tr>
            <td>${String(it.name ?? "").replaceAll("<", "&lt;")}</td>
            <td style="text-align:right;">${money(qty)}</td>
            <td style="text-align:right;">${money(unit)}</td>
            <td style="text-align:right;"><b>${money(line)}</b></td>
          </tr>
        `;
      })
      .join("");

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>견적서</title>
  <style>
    *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;}
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
    @media print{
      body{margin:0;}
      .card{border:none;padding:0;}
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">${shopName} 견적서</div>
      <div class="sub">Tel: ${shopTel}</div>
    </div>
    <div style="text-align:right;">
      <div class="label">발행일</div>
      <div class="val">${issueDate}</div>
      <div class="label" style="margin-top:10px;">작업 ID</div>
      <div class="val">${estimateRes.reservation_id}</div>
    </div>
  </div>

  <div class="card">
    <div class="row">
      <div class="col">
        <div class="label">고객명</div>
        <div class="val">${(estimateRes.full_name ?? "-").replaceAll("<", "&lt;")}</div>
      </div>
      <div class="col">
        <div class="label">연락처</div>
        <div class="val">${(estimateRes.phone ?? "-").replaceAll("<", "&lt;")}</div>
      </div>
      <div class="col">
        <div class="label">차량</div>
        <div class="val">${(estimateRes.car_model ?? "-").replaceAll("<", "&lt;")}</div>
      </div>
    </div>

    <div class="row" style="margin-top:10px;">
      <div class="col">
        <div class="label">작업일정</div>
        <div class="val">${workRangeLabel(estimateRes)}</div>
      </div>
      <div class="col">
        <div class="label">상태</div>
        <div class="val">${STATUS_LABEL[estimateRes.status]}</div>
      </div>
      <div class="col">
        <div class="label">담당자</div>
        <div class="val">${(estimateRes.assigned_admin_label ?? "미배정").replaceAll("<", "&lt;")}</div>
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
      합계 <b>${money(estimateTotal)}원</b>
    </div>

    ${
      estimateMemo.trim()
        ? `<div class="memo"><div class="label">메모</div>${estimateMemo.replaceAll("<", "&lt;")}</div>`
        : ""
    }
  </div>

  <script>window.onload=()=>{window.print();}</script>
</body>
</html>
    `.trim();

    const w = window.open("", "_blank", "noopener,noreferrer,width=860,height=920");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
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
          <button className="ohBtn" onClick={load} disabled={loading}>
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
          <input
            className="ohInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름/전화/차량/서비스/작업ID/담당자"
          />
        </div>

        <button className="ohBtnGhost" onClick={load} disabled={loading}>
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
          pageItems.map((r) => (
            <div key={r.work_id} className="ohRow">
              <div className="ohRowMain">
                <div className="ohRowTitle">
                  <span className="ohService">{r.service_name}</span>
                  <span className={`ohStatus ohStatus--${r.status}`}>{STATUS_LABEL[r.status]}</span>
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
                </div>
              </div>

              <div className="ohRowActions">
                <button className="ohBtnGhost" onClick={() => goToOps(r)} title="운영 화면에서 보기">
                  운영 →
                </button>
                <button className="ohBtn" onClick={() => openEstimate(r)} title="견적서 만들기">
                  견적서
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="ohEmpty">{loading ? "불러오는 중..." : "데이터가 없습니다."}</div>
        )}
      </div>

      <div className="ohPager">
        <button className="ohBtnGhost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          이전
        </button>
        <div className="ohPagerInfo">
          {page} / {totalPages}
        </div>
        <button className="ohBtnGhost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
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
                <div className="ohModalTitle">견적서 만들기</div>
                <div className="ohModalSub">
                  {estimateRes.full_name ?? "-"} · {estimateRes.phone ?? "-"} · {workRangeLabel(estimateRes)}
                </div>
              </div>
              <button className="ohIconBtn" onClick={() => setEstimateOpen(false)} aria-label="닫기">
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
                            setEstimateItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, qty: Number.isFinite(v) ? v : 0 } : x))
                            );
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
                            setEstimateItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, unitPrice: Number.isFinite(v) ? v : 0 } : x))
                            );
                          }}
                          placeholder="단가"
                        />

                        <div className="ohLineSum">{money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}원</div>

                        <button
                          className="ohBtnDanger"
                          type="button"
                          onClick={() => setEstimateItems((prev) => prev.filter((_, i) => i !== idx))}
                          title="삭제"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="ohItemActions">
                    <button
                      className="ohBtnGhost"
                      type="button"
                      onClick={() => setEstimateItems((prev) => [...prev, { name: "부품", qty: 1, unitPrice: 0 }])}
                    >
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
              <button className="ohBtnGhost" onClick={() => setEstimateOpen(false)}>
                닫기
              </button>
              <button className="ohBtn" onClick={printEstimate}>
                인쇄/저장(PDF)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
