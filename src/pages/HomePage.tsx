// src/pages/HomePage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/homeShowroom.css";

// ✅ 프리미엄 오버레이 스타일
import "../styles/homeShowroomPremium.css";

// import Navbar from "../components/Navbar";

type HomePageProps = {
  isAuthed: boolean;
  isAdmin: boolean;
};

type LoadState<T> = { loading: boolean; error: string | null; data: T | null };

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function todayRangeKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();

  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60 * 1000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startISO: startUtc.toISOString(), endISO: endUtc.toISOString() };
}

function formatTimeHHMM(value: any) {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s;
}

function fmtKST(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function useSpotlightVars<T extends HTMLElement>(containerRef: React.RefObject<T | null>) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const set = (x: number, y: number) => {
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(e.clientX - r.left, e.clientY - r.top);
    };

    const onLeave = () => {
      const r = el.getBoundingClientRect();
      set(r.width * 0.5, r.height * 0.25);
    };

    onLeave();
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [containerRef]);
}

type ServiceItemRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  active: boolean;
  duration_unit: string;
  duration_value: number | null;
};

function formatDuration(it: ServiceItemRow): string {
  if (it.duration_unit === "workdays" && it.duration_value) return `${it.duration_value}일`;
  return `${it.duration_minutes}분`;
}

// ✅ 홈 공개용 최근 완료 통계 응답 타입
type RecentCompletedItem = { completed_at: string; service_name: string | null };
type RecentCompletedSummary = { count: number; items: RecentCompletedItem[] };

export default function HomePage({ isAuthed, isAdmin }: HomePageProps) {
  const nav = useNavigate();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useSpotlightVars(wrapRef);

  const [pickerOpen, setPickerOpen] = useState(false);

  const [items, setItems] = useState<LoadState<ServiceItemRow[]>>({
    loading: true,
    error: null,
    data: null,
  });

  const [ops, setOps] = useState<LoadState<any>>({
    loading: true,
    error: null,
    data: null,
  });

  const [blocks, setBlocks] = useState<LoadState<any[]>>({
    loading: true,
    error: null,
    data: null,
  });

  const [slotSummary, setSlotSummary] = useState<
    LoadState<{ count: number; next: string | null; basisItemName: string | null }>
  >({
    loading: true,
    error: null,
    data: null,
  });

  // ✅ 최근 7일 완료 통계/리스트 (개인정보 없음)
  const [recentDone, setRecentDone] = useState<LoadState<RecentCompletedSummary>>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        // 1) service_items
        const r1 = await supabase
          .from("service_items")
          .select("id,name,description,duration_minutes,active,duration_unit,duration_value");

        if (!alive) return;

        if (r1.error) {
          setItems({ loading: false, error: r1.error.message, data: [] });
        } else {
          const list = (r1.data ?? []) as any[];
          const normalized: ServiceItemRow[] = list.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            description: row.description ?? null,
            duration_minutes: Number(row.duration_minutes),
            active: Boolean(row.active),
            duration_unit: String(row.duration_unit ?? "minutes"),
            duration_value: row.duration_value != null ? Number(row.duration_value) : null,
          }));

          normalized.sort((a, b) => {
            const aa = Number(b.active) - Number(a.active);
            if (aa !== 0) return aa;
            return a.name.localeCompare(b.name, "ko");
          });

          setItems({ loading: false, error: null, data: normalized });
        }

        // 2) ops_settings(id=1)
        const r2 = await supabase.from("ops_settings").select("*").eq("id", 1).maybeSingle();
        if (!alive) return;

        if (r2.error) setOps({ loading: false, error: r2.error.message, data: null });
        else setOps({ loading: false, error: null, data: r2.data });

        // 3) blocked_times (오늘 KST 기준 겹치는 것)
        const { startISO, endISO } = todayRangeKST();
        const r3 = await supabase
          .from("blocked_times")
          .select("id,start_at,end_at,reason")
          .lt("start_at", endISO)
          .gt("end_at", startISO)
          .order("start_at", { ascending: true });

        if (!alive) return;

        if (r3.error) setBlocks({ loading: false, error: r3.error.message, data: [] });
        else setBlocks({ loading: false, error: null, data: r3.data ?? [] });
      } catch (e: any) {
        if (!alive) return;
        const msg = e?.message ?? String(e);
        setItems({ loading: false, error: msg, data: [] });
        setOps({ loading: false, error: msg, data: null });
        setBlocks({ loading: false, error: msg, data: [] });
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, []);

  // 4) 오늘 남은 슬롯 요약 (대표 아이템 1개 기준)
  useEffect(() => {
    let alive = true;

    const run = async () => {
      setSlotSummary({ loading: true, error: null, data: null });

      const list = items.data ?? [];
      const basis = list.find((x) => x.active) ?? null;

      if (!basis) {
        setSlotSummary({ loading: false, error: null, data: { count: 0, next: null, basisItemName: null } });
        return;
      }

      try {
        const dateStr = todayKST();
        const r = await supabase.rpc("get_available_slots", {
          slot_date: dateStr,
          service_item_id: basis.id,
        });

        if (!alive) return;

        if (r.error) {
          setSlotSummary({
            loading: false,
            error: r.error.message,
            data: { count: 0, next: null, basisItemName: basis.name },
          });
          return;
        }

        const rows = (r.data ?? []) as any[];
        const slots = rows.map((x) => String(x.slot_start)).filter(Boolean);
        slots.sort();

        setSlotSummary({
          loading: false,
          error: null,
          data: { count: slots.length, next: slots[0] ?? null, basisItemName: basis.name },
        });
      } catch (e: any) {
        if (!alive) return;
        setSlotSummary({
          loading: false,
          error: e?.message ?? String(e),
          data: { count: 0, next: null, basisItemName: basis?.name ?? null },
        });
      }
    };

    if (!items.loading) run();
    return () => {
      alive = false;
    };
  }, [items.loading, items.data]);

  // ✅ 5) 최근 7일 완료 통계/리스트 (RLS 영향 없이 안전 RPC)
  useEffect(() => {
    let alive = true;

    const run = async () => {
      setRecentDone({ loading: true, error: null, data: null });
      try {
        const r = await supabase.rpc("public_recent_completed_summary", { days: 7, lim: 6 });
        if (!alive) return;

        if (r.error) {
          setRecentDone({ loading: false, error: r.error.message, data: { count: 0, items: [] } });
          return;
        }

        const raw = r.data as any;
        const count = Number(raw?.count ?? 0);
        const items = Array.isArray(raw?.items) ? raw.items : [];
        const normalized: RecentCompletedItem[] = items
          .map((x: any) => ({
            completed_at: String(x?.completed_at ?? ""),
            service_name: x?.service_name != null ? String(x.service_name) : null,
          }))
          .filter((x: RecentCompletedItem) => x.completed_at);

        setRecentDone({ loading: false, error: null, data: { count, items: normalized } });
      } catch (e: any) {
        if (!alive) return;
        setRecentDone({
          loading: false,
          error: e?.message ?? String(e),
          data: { count: 0, items: [] },
        });
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, []);

  const opsInfo = useMemo(() => {
    const d = ops.data;
    if (!d) return null;
    return {
      open: formatTimeHHMM(d.open_time),
      close: formatTimeHHMM(d.close_time),
      slot: d.slot_minutes != null ? `${d.slot_minutes}분` : null,
      capacity: d.capacity != null ? `동시 작업 ${d.capacity}대` : null,
      tz: d.tz ? String(d.tz) : "Asia/Seoul",
      maxBatch: d.max_batch_qty != null ? `리프트 개수 ${d.max_batch_qty}개` : null,
    };
  }, [ops.data]);

  const blocksSummary = useMemo(() => {
    const list = blocks.data ?? [];
    const top = list.slice(0, 3).map((b) => ({
      id: b.id,
      start: b.start_at ? fmtKST(b.start_at) : "",
      end: b.end_at ? fmtKST(b.end_at) : "",
      reason: b.reason ? String(b.reason) : "차단",
    }));
    return { count: list.length, top };
  }, [blocks.data]);

  const activeItems = useMemo(() => (items.data ?? []).filter((x) => x.active), [items.data]);
  const inactiveItems = useMemo(() => (items.data ?? []).filter((x) => !x.active), [items.data]);

  const handleReserveClick = () => {
    if (!isAuthed) {
      nav("/auth");
      return;
    }
    setPickerOpen(true);
  };

  const goBookWithItem = (serviceItemId: string) => {
    setPickerOpen(false);
    nav(`/book?service_item_id=${encodeURIComponent(serviceItemId)}`);
  };

  return (
    <>
      {/* <Navbar isAuthed={isAuthed} isAdmin={isAdmin} /> */}

      <div className="showroomSimple" ref={wrapRef}>
        <div className="showroomBg" aria-hidden />
        <div className="showroomNoise" aria-hidden />
        <div className="showroomSpot" aria-hidden />

        <section className="heroSimple">
          <div className="heroInner premiumHero">
            <h1 className="heroTitle">
              <br />
              정직한 서비스와, 합리적인 가격으로
              <br />
              고객님의 차량을 케어합니다.
            </h1>

            <p className="heroSub">
              타이어 플렉스가 함께합니다.
              <br />
              타이어교체 및 경정비, 기타 문의 031-355-0018
              <br />
              <br />
            </p>

            <div className="ctaRow">
              <button className="btnPrimary" type="button" onClick={handleReserveClick}>
                <span className="btnSheen" aria-hidden />
                {isAuthed ? "예약하기" : "로그인하고 예약하기"}
              </button>

              {isAuthed ? (
                <Link className="btnGhost" to="/onboarding">
                  프로필
                </Link>
              ) : (
                <Link className="btnGhost" to="/auth">
                  로그인
                </Link>
              )}

              {isAdmin ? (
                <Link className="btnGhost" to="/admin">
                  관리자 운영
                </Link>
              ) : null}
            </div>

            {/* 오늘 운영 요약 */}
            <div className="opsSummary">
              <div className="opsBox">
                <div className="opsLabel">영업 시간</div>
                <div className="opsValue">
                  {ops.loading ? (
                    "불러오는 중…"
                  ) : opsInfo?.open && opsInfo?.close ? (
                    <>
                      {opsInfo.open} ~ {opsInfo.close}
                    </>
                  ) : (
                    "운영정보 없음"
                  )}
                </div>
                <div className="chipRow">
                  {opsInfo?.slot ? <span className="chip">{opsInfo.slot} 슬롯</span> : null}
                  {opsInfo?.capacity ? <span className="chip">{opsInfo.capacity}</span> : null}
                  {opsInfo?.maxBatch ? <span className="chip">{opsInfo.maxBatch}</span> : null}
                  {opsInfo?.tz ? <span className="chip">{opsInfo.tz}</span> : null}
                </div>
              </div>

              <div className="opsBox">
                <div className="opsLabel">작업 가능 타임 확인</div>
                <div className="opsValue">{slotSummary.loading ? "불러오는 중…" : `${slotSummary.data?.count ?? 0} 타임 가능`}</div>

                <div className="blocksMini">
                  <div className="muted">
                    기준: {slotSummary.data?.basisItemName ?? "활성 아이템 없음"}
                    {slotSummary.data?.next ? ` · 다음 ${fmtKST(slotSummary.data.next)}` : ""}
                  </div>

                  <div className="blockRow">
                    <span className="blockTime">휴식 타임</span>
                    <span className="blockReason">{blocks.loading ? "…" : `${blocksSummary.count}건`}</span>
                  </div>

                  {blocksSummary.count === 0 && !blocks.loading ? <div className="muted">오늘 휴무 없음</div> : null}

                  {blocksSummary.top.map((b) => (
                    <div className="blockRow" key={String(b.id)}>
                      <span className="blockTime">
                        {b.start}–{b.end}
                      </span>
                      <span className="blockReason">{b.reason}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ✅ 최근 7일 완료 내역(개인정보 없음) */}
              <div className="opsBox">
                <div className="opsLabel">최근 7일 정비 완료</div>
                <div className="opsValue">
                  {recentDone.loading ? "불러오는 중…" : `${recentDone.data?.count ?? 0}건 완료`}
                </div>

                <div className="blocksMini">
                  {recentDone.error ? <div className="muted">오류: {recentDone.error}</div> : null}
                  {!recentDone.loading && (recentDone.data?.items?.length ?? 0) === 0 ? (
                    <div className="muted">최근 완료 내역이 없습니다.</div>
                  ) : null}

                  {(recentDone.data?.items ?? []).map((x, idx) => (
                    <div className="blockRow" key={`${x.completed_at}-${idx}`}>
                      <span className="blockTime">{fmtKST(x.completed_at)}</span>
                      <span className="blockReason">{x.service_name ?? "정비"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {items.error || ops.error || blocks.error ? (
              <div className="alertSimple">
                <div className="alertTitle">데이터 로딩 이슈</div>
                <div className="alertBody">
                  {items.error ? <div>service_items: {items.error}</div> : null}
                  {ops.error ? <div>ops_settings: {ops.error}</div> : null}
                  {blocks.error ? <div>blocked_times: {blocks.error}</div> : null}
                  {slotSummary.error ? <div>get_available_slots: {slotSummary.error}</div> : null}
                </div>
                <button className="btnGhost small" onClick={() => nav("/debug")}>
                  Debug
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* 예약하기 버튼 눌렀을 때만 뜨는 아이템 선택 패널 */}
        {pickerOpen ? (
          <div className="modalBackdrop" role="dialog" aria-modal="true">
            <div className="modalPanel">
              <div className="modalHead">
                <div>
                  <div className="modalTitle">정비 아이템 선택</div>
                  <div className="modalSub">선택 후 예약 화면으로 이동합니다.</div>
                </div>
                <button className="iconBtn" onClick={() => setPickerOpen(false)} aria-label="닫기">
                  ✕
                </button>
              </div>

              <div className="modalBody">
                {items.loading ? <div className="muted">아이템 불러오는 중…</div> : null}

                <div className="sectionMiniTitle">활성 아이템</div>
                <div className="itemList">
                  {activeItems.map((it) => (
                    <div className="itemRow" key={String(it.id)}>
                      <div className="itemMain">
                        <div className="itemName">{it.name}</div>
                        <div className="itemDesc">{it.description ?? "설명 미설정"}</div>
                        <div className="itemMeta">
                          <span className="chip">{formatDuration(it)}</span>
                        </div>
                      </div>

                      <div className="itemActions">
                        <button className="btnPrimary small" onClick={() => goBookWithItem(String(it.id))}>
                          <span className="btnSheen" aria-hidden />
                          선택
                        </button>
                      </div>
                    </div>
                  ))}
                  {!items.loading && activeItems.length === 0 ? <div className="muted">활성 아이템이 없습니다.</div> : null}
                </div>

                {inactiveItems.length > 0 ? (
                  <>
                    <div className="sectionMiniTitle" style={{ marginTop: 14 }}>
                      비활성 아이템
                    </div>
                    <div className="itemList">
                      {inactiveItems.map((it) => (
                        <div className="itemRow" key={String(it.id)}>
                          <div className="itemMain">
                            <div className="itemName">
                              {it.name} <span className="tagOff">OFF</span>
                            </div>
                            <div className="itemDesc">{it.description ?? "설명 미설정"}</div>
                            <div className="itemMeta">
                              <span className="chip">{formatDuration(it)}</span>
                            </div>
                          </div>

                          <div className="itemActions">
                            <button className="btnPrimary small" disabled title="비활성화된 아이템입니다">
                              <span className="btnSheen" aria-hidden />
                              선택
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              <div className="modalFoot">
                <div className="muted">
                  * 선택 시 <code>service_item_id</code>를 쿼리로 전달합니다.
                </div>
                <div className="footBtns">
                  <button className="btnGhost small" onClick={() => setPickerOpen(false)}>
                    닫기
                  </button>
                  <Link className="btnGhost small" to="/book" onClick={() => setPickerOpen(false)}>
                    그냥 예약 화면으로
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
