// src/components/Home3D.tsx
import React, { useEffect, useMemo, useRef } from "react";
import "./home3d.css";

type Home3DProps = {
  onGoBook?: () => void;
  onGoAdmin?: () => void;
  bookHref?: string;
  adminHref?: string;
  title?: string;
  subtitle?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * ✅ FIX: RefObject<HTMLElement> -> RefObject<T | null> 로 변경해서
 * useRef<HTMLDivElement | null>(null) 같은 타입도 그대로 받을 수 있게 함
 */
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

function useTiltCard() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const card = ref.current;
    if (!card) return;

    let raf = 0;

    const setVars = (rx: number, ry: number, s: number) => {
      card.style.setProperty("--rx", `${rx}deg`);
      card.style.setProperty("--ry", `${ry}deg`);
      card.style.setProperty("--s", `${s}`);
    };

    setVars(0, 0, 1);

    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;

      const ry = clamp((px - 0.5) * 14, -8, 8);
      const rx = clamp((0.5 - py) * 14, -8, 8);

      const hx = clamp(px * 100, 0, 100);
      const hy = clamp(py * 100, 0, 100);

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVars(rx, ry, 1.02);
        card.style.setProperty("--hx", `${hx}%`);
        card.style.setProperty("--hy", `${hy}%`);
      });
    };

    const onEnter = () => setVars(0, 0, 1.02);
    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVars(0, 0, 1);
        card.style.setProperty("--hx", `50%`);
        card.style.setProperty("--hy", `20%`);
      });
    };

    card.addEventListener("pointermove", onMove, { passive: true });
    card.addEventListener("pointerenter", onEnter, { passive: true });
    card.addEventListener("pointerleave", onLeave, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerenter", onEnter);
      card.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return ref;
}

function ActionCard(props: {
  eyebrow: string;
  title: string;
  desc: string;
  bullets: string[];
  primaryLabel: string;
  onPrimary?: () => void;
  href?: string;
  badge?: string;
  icon?: React.ReactNode;
}) {
  const cardRef = useTiltCard();

  const content = (
    <>
      <div className="h3d-cardTop">
        <div className="h3d-eyebrow">{props.eyebrow}</div>
        {props.badge ? <div className="h3d-badge">{props.badge}</div> : null}
      </div>

      <div className="h3d-titleRow">
        <div className="h3d-cardIcon" aria-hidden>
          {props.icon}
        </div>
        <div className="h3d-cardTitle">{props.title}</div>
      </div>

      <div className="h3d-cardDesc">{props.desc}</div>

      <ul className="h3d-bullets">
        {props.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      <div className="h3d-actions">
        <button className="h3d-btnPrimary" type="button" onClick={props.onPrimary}>
          <span className="h3d-btnGlow" aria-hidden />
          {props.primaryLabel}
        </button>
        <div className="h3d-hint">마우스를 올리면 카드가 기울며 반응</div>
      </div>

      <div className="h3d-cardFooter">
        <div className="h3d-chip">3D Tilt</div>
        <div className="h3d-chip">Spotlight</div>
        <div className="h3d-chip">Glass</div>
      </div>
    </>
  );

  const wrappedPrimary =
    props.onPrimary || !props.href ? (
      content
    ) : (
      <>
        {content}
        <a className="h3d-cardLinkOverlay" href={props.href} aria-label={props.primaryLabel} />
      </>
    );

  return (
    <div className="h3d-card" ref={cardRef}>
      <div className="h3d-cardInner">{wrappedPrimary}</div>
      <div className="h3d-cardEdge" aria-hidden />
    </div>
  );
}

export default function Home3D({
  onGoBook,
  onGoAdmin,
  bookHref = "/book",
  adminHref = "/admin/schedule",
  title = "InSide FLAT",
  subtitle = "경차부터 슈퍼카까지 경정비와 타이어는 FLAT에 맡기세요.",
}: Home3DProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useSpotlightVars(wrapRef);

  const icons = useMemo(
    () => ({
      wrench: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M14.7 6.3a5 5 0 0 1-6.4 6.4l-4.3 4.3a1.5 1.5 0 0 0 2.1 2.1l4.3-4.3a5 5 0 0 1 6.4-6.4l-2.1 2.1 2.8 2.8 2.1-2.1a5 5 0 0 1-3 7.7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      shield: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2 20 6v6c0 5-3.3 9.4-8 10-4.7-.6-8-5-8-10V6l8-4Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 12.2 11 13.7l3.6-3.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    }),
    []
  );

  return (
    <div className="h3d-wrap" ref={wrapRef}>
      <div className="h3d-bg" aria-hidden />
      <div className="h3d-noise" aria-hidden />
      <div className="h3d-spotlight" aria-hidden />

      <header className="h3d-hero">
        <div className="h3d-logoRow">
          <div className="h3d-mark" aria-hidden>
            <span />
          </div>
          <div className="h3d-brand">{title}</div>
          <div className="h3d-kicker">3D Home</div>
        </div>

        <h1 className="h3d-h1">
          예약은 매끈하게,
          <br />
          운영은 단단하게.
        </h1>
        <p className="h3d-sub">{subtitle}</p>

        <div className="h3d-miniStats">
          <div className="h3d-stat">
            <div className="h3d-statNum">ops_settings</div>
            <div className="h3d-statLabel">운영설정 기반 슬롯</div>
          </div>
          <div className="h3d-stat">
            <div className="h3d-statNum">Drag & Drop</div>
            <div className="h3d-statLabel">관리자 스케줄 이동</div>
          </div>
          <div className="h3d-stat">
            <div className="h3d-statNum">Admin RPC</div>
            <div className="h3d-statLabel">배정/완료/삭제</div>
          </div>
        </div>
      </header>

      <main className="h3d-main">
        <div className="h3d-grid">
          <ActionCard
            eyebrow="사용자"
            badge="BOOK"
            title="정비 예약하기"
            desc="운영설정 기반 슬롯에서 빠르게 예약을 생성해요."
            bullets={["정비 아이템 목록", "슬롯 조회(get_available_slots)", "예약 생성(create_reservation)"]}
            primaryLabel="예약 화면으로"
            onPrimary={onGoBook}
            href={bookHref}
            icon={icons.wrench}
          />

          <ActionCard
            eyebrow="관리자"
            badge="ADMIN"
            title="운영 스케줄"
            desc="날짜별 예약을 보고, 배정하고, 드래그로 시간을 바꿔요."
            bullets={["날짜별 예약 조회", "배정/완료 처리", "드래그앤드롭 시간 이동"]}
            primaryLabel="관리자 화면으로"
            onPrimary={onGoAdmin}
            href={adminHref}
            icon={icons.shield}
          />
        </div>

        <section className="h3d-strip">
          <div className="h3d-stripInner">
            <div className="h3d-stripTitle">3D 느낌 포인트</div>
            <div className="h3d-stripText">
              배경 그리드 + 마우스 스포트라이트 + 유리 카드 + 틸트 반응으로 웹 3D 착시를 만듭니다.
            </div>
          </div>
        </section>
      </main>

      <footer className="h3d-footer">
        <div>© Car Service</div>
        <div className="h3d-footerChips">
          <span className="h3d-chip">Performance-safe</span>
          <span className="h3d-chip">No WebGL required</span>
          <span className="h3d-chip">Mobile friendly</span>
        </div>
      </footer>
    </div>
  );
}
