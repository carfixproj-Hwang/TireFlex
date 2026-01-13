// src/pages/owner/OwnerEstimatesPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/ownerHistoryPremium.css";

import {
  ownerDeleteServiceEstimate,
  ownerListServiceEstimatesByIssuedRange,
  ownerUpsertServiceEstimate,
  type EstimateItem,
  type ServiceEstimateRow,
} from "../../lib/ownerEstimates";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function toKstFull(iso: string) {
  return new Date(iso).toLocaleString("ko-KR");
}
function kstDateStr(iso: string) {
  const dt = new Date(iso);
  const k = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;
}
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

function printEstimateHTML(input: {
  estimateNo?: string;
  issueAtIso: string;
  snapshot: any;
  items: EstimateItem[];
  memo?: string | null;
  totalAmount: number;
}) {
  const shopName = "TIRE FLEX";
  const shopTel = "031-355-0018";
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
      <div class="label">예약 ID</div>
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
        <div class="label">예약일시</div>
        <div class="val">${escapeHtml(snap.scheduled_at ? toKstFull(String(snap.scheduled_at)) : "-")}</div>
      </div>
      <div class="col">
        <div class="label">서비스</div>
        <div class="val">${escapeHtml(String(snap.service_name ?? "-"))}</div>
      </div>
      <div class="col">
        <div class="label">담당자</div>
        <div class="val">${escapeHtml(String(snap.assigned_admin_label ?? "미배정"))}</div>
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

  const w = window.open("", "_blank", "width=860,height=920");
  if (!w) {
    alert("팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저에서 팝업 허용 후 다시 시도해주세요.");
    return;
  }

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

export default function OwnerEstimatesPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return ymd(d);
  });
  const [endDate, setEndDate] = useState(() => ymd(new Date()));

  const [rows, setRows] = useState<ServiceEstimateRow[]>([]);
  const [q, setQ] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 편집 모달
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<ServiceEstimateRow | null>(null);
  const [items, setItems] = useState<EstimateItem[]>([]);
  const [memo, setMemo] = useState("");

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const data = await ownerListServiceEstimatesByIssuedRange(startDate, endDate);
      setRows(data ?? []);
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
    if (!qq) return rows;

    return rows.filter((r) => {
      const snap = r.snapshot ?? {};
      const hay = [
        r.id,
        r.reservation_id ?? "",
        snap.reservation_id ?? "",
        snap.full_name ?? "",
        snap.phone ?? "",
        snap.car_model ?? "",
        snap.service_name ?? "",
        snap.assigned_admin_label ?? "",
        r.memo ?? "",
        String(r.total_amount ?? ""),
        r.issued_at ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const sum = filtered.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
    return { total, sum };
  }, [filtered]);

  function openEdit(r: ServiceEstimateRow) {
    setCur(r);
    setItems(Array.isArray(r.items) ? r.items : []);
    setMemo(r.memo ?? "");
    setOpen(true);
  }

  const totalAmount = useMemo(() => {
    return (items ?? []).reduce((acc, it) => acc + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  }, [items]);

  async function saveOnly(): Promise<ServiceEstimateRow | null> {
    if (!cur) return null;

    try {
      setLoading(true);
      setMsg(null);

      const saved = await ownerUpsertServiceEstimate({
        id: cur.id,
        reservationId: cur.reservation_id,
        snapshot: cur.snapshot ?? {},
        items,
        memo,
        totalAmount,
      });

      setRows((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      setCur(saved);
      return saved;
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function saveAndPrint() {
    const saved = await saveOnly();
    if (!saved) return;

    printEstimateHTML({
      estimateNo: saved.id,
      issueAtIso: saved.issued_at,
      snapshot: saved.snapshot,
      items: (saved.items ?? []) as EstimateItem[],
      memo: saved.memo,
      totalAmount: saved.total_amount ?? 0,
    });
  }

  function printRow(r: ServiceEstimateRow) {
    printEstimateHTML({
      estimateNo: r.id,
      issueAtIso: r.issued_at,
      snapshot: r.snapshot,
      items: (r.items ?? []) as EstimateItem[],
      memo: r.memo,
      totalAmount: r.total_amount ?? 0,
    });
  }

  async function deleteRow(r: ServiceEstimateRow) {
    const ok = confirm("이 견적서를 삭제할까요? (되돌릴 수 없음)");
    if (!ok) return;

    try {
      setLoading(true);
      setMsg(null);
      await ownerDeleteServiceEstimate(r.id);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      if (cur?.id === r.id) {
        setOpen(false);
        setCur(null);
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function goToReservationOps(r: ServiceEstimateRow) {
    const snap = r.snapshot ?? {};
    const scheduledAt = snap.scheduled_at ? String(snap.scheduled_at) : null;
    const resId = r.reservation_id ?? (snap.reservation_id ? String(snap.reservation_id) : null);

    if (!scheduledAt || !resId) {
      alert("이 견적서는 예약 정보가 부족해서 운영 화면으로 이동할 수 없습니다.");
      return;
    }

    const ds = kstDateStr(scheduledAt);
    const qs = new URLSearchParams();
    qs.set("date", ds);
    qs.set("tab", "schedule");
    qs.set("focus", resId);
    nav(`/admin?${qs.toString()}`);
  }

  return (
    <div className="ohShell">
      <div className="ohBg" aria-hidden />

      <div className="ohTop">
        <div className="ohTitle">
          <div className="ohTitleMain">오너 · 견적서 관리</div>
          <div className="ohTitleSub">기간/검색 · 저장된 견적서 확인, 편집, 인쇄</div>
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

        <div className="ohField ohFieldWide">
          <div className="ohLabel">검색</div>
          <input
            className="ohInput"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="견적번호/예약ID/고객명/전화/차량/서비스/메모"
          />
        </div>

        <button className="ohBtnGhost" onClick={load} disabled={loading}>
          적용
        </button>
      </div>

      <div className="ohHint">
        <span className="ohChip">총 {stats.total}건</span>
        <span className="ohChip ohChipOk">합계 {money(stats.sum)}원</span>
        {msg ? <span className="ohMsg">{msg}</span> : null}
      </div>

      <div className="ohList">
        {pageItems.length ? (
          pageItems.map((r) => {
            const snap = r.snapshot ?? {};
            const title = String(snap.service_name ?? "견적서");
            const fullName = String(snap.full_name ?? "-");
            const phone = String(snap.phone ?? "-");
            const car = String(snap.car_model ?? "-");
            const issued = toKstFull(r.issued_at);
            const memoShort = (r.memo ?? "").trim();

            return (
              <div key={r.id} className="ohRow">
                <div className="ohRowMain">
                  <div className="ohRowTitle">
                    <span className="ohService">{title}</span>
                    <span className="ohChip" style={{ marginLeft: 10 }}>
                      {money(r.total_amount ?? 0)}원
                    </span>
                  </div>

                  <div className="ohRowSub">
                    <span>발행: {issued}</span>
                    <span className="ohDot">·</span>
                    <span>고객: {fullName}</span>
                    <span className="ohDot">·</span>
                    <span>전화: {phone}</span>
                    <span className="ohDot">·</span>
                    <span>차량: {car}</span>
                  </div>

                  <div className="ohRowSub2">
                    <span>견적번호: {r.id}</span>
                    <span className="ohDot">·</span>
                    <span>예약ID: {String(r.reservation_id ?? snap.reservation_id ?? "-")}</span>
                    {memoShort ? (
                      <>
                        <span className="ohDot">·</span>
                        <span style={{ opacity: 0.85 }}>메모: {memoShort.length > 80 ? memoShort.slice(0, 80) + "…" : memoShort}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="ohRowActions">
                  <button className="ohBtnGhost" onClick={() => goToReservationOps(r)} title="운영 화면에서 예약 보기">
                    일자 확인
                  </button>
                  <button className="ohBtnGhost" onClick={() => printRow(r)} title="바로 인쇄">
                    인쇄
                  </button>
                  <button className="ohBtn" onClick={() => openEdit(r)} title="편집">
                    편집
                  </button>
                  <button className="ohBtnDanger" onClick={() => deleteRow(r)} title="삭제">
                    삭제
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

      {/* 편집 모달 */}
      {open && cur ? (
        <div
          className="ohModalBackdrop"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="ohModal">
            <div className="ohModalHead">
              <div>
                <div className="ohModalTitle">견적서 편집</div>
                <div className="ohModalSub">
                  {toKstFull(cur.issued_at)} · 견적번호 {cur.id}
                </div>
              </div>
              <button className="ohIconBtn" onClick={() => setOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>

            <div className="ohModalBody">
              <div className="ohEstimateGrid">
                <div className="ohCard">
                  <div className="ohCardTitle">기본 정보</div>
                  <div className="ohKV">
                    <div>
                      <div className="ohK">고객명</div>
                      <div className="ohV">{String(cur.snapshot?.full_name ?? "-")}</div>
                    </div>
                    <div>
                      <div className="ohK">연락처</div>
                      <div className="ohV">{String(cur.snapshot?.phone ?? "-")}</div>
                    </div>
                    <div>
                      <div className="ohK">차량</div>
                      <div className="ohV">{String(cur.snapshot?.car_model ?? "-")}</div>
                    </div>
                    <div>
                      <div className="ohK">서비스</div>
                      <div className="ohV">{String(cur.snapshot?.service_name ?? "-")}</div>
                    </div>
                  </div>
                </div>

                <div className="ohCard">
                  <div className="ohCardTitle">견적 항목</div>

                  <div className="ohItems">
                    {items.map((it, idx) => (
                      <div key={idx} className="ohItemRow">
                        <input
                          className="ohInput"
                          value={it.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)));
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
                            setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: Number.isFinite(v) ? v : 0 } : x)));
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
                            setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unitPrice: Number.isFinite(v) ? v : 0 } : x)));
                          }}
                          placeholder="단가"
                        />

                        <div className="ohLineSum">{money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}원</div>

                        <button
                          className="ohBtnDanger"
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          title="삭제"
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="ohItemActions">
                    <button className="ohBtnGhost" type="button" onClick={() => setItems((prev) => [...prev, { name: "부품", qty: 1, unitPrice: 0 }])}>
                      + 항목 추가
                    </button>

                    <div className="ohTotal">
                      합계 <b>{money(totalAmount)}원</b>
                    </div>
                  </div>

                  <div className="ohField" style={{ marginTop: 12 }}>
                    <div className="ohLabel">메모</div>
                    <textarea
                      className="ohTextarea"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="예: 타이어 4본 교체, 얼라인먼트 포함, 부품 보증 6개월..."
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="ohModalFoot">
              <button className="ohBtnGhost" onClick={() => setOpen(false)} disabled={loading}>
                닫기
              </button>
              <button className="ohBtnGhost" onClick={saveOnly} disabled={loading}>
                저장만
              </button>
              <button className="ohBtn" onClick={saveAndPrint} disabled={loading}>
                저장 후 인쇄/저장(PDF)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
