// src/components/Navbar.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/tireflex-logo.png";
import "../styles/navbarPremium.css";
import { supabase } from "../lib/supabaseClient";

type AppRole = "owner" | "staff" | "member";

type Props = {
  isAuthed: boolean;
  isAdmin: boolean; // staff || owner
  role: AppRole;
};

type AdminNavItem = {
  to: string;
  label: string;
  roles: AppRole[];
};

export default function Navbar({ isAuthed, isAdmin, role }: Props) {
  const nav = useNavigate();

  const [adminOpen, setAdminOpen] = useState(false);
  const adminWrapRef = useRef<HTMLDivElement | null>(null);
  const adminBtnRef = useRef<HTMLButtonElement | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAdminOpen(false);
    nav("/auth");
  };

  const adminItems: AdminNavItem[] = useMemo(
    () => [
      { to: "/admin", label: "관리자 · 운영", roles: ["staff", "owner"] },
      { to: "/admin/calendar", label: "관리자 · 달력", roles: ["staff", "owner"] },
      { to: "/admin/services", label: "관리자 · 아이템", roles: ["staff", "owner"] },
      { to: "/admin/users", label: "관리자 · 회원 관리", roles: ["staff", "owner"] },

      // ✅ 오너 전용
      { to: "/owner/history", label: "오너 · 전체 정비 내역", roles: ["owner"] },
      { to: "/owner/estimates", label: "오너 · 견적서 관리", roles: ["owner"] },
      { to: "/admin/staff", label: "오너 · 직원 관리", roles: ["owner"] },
      { to: "/owner/staff", label: "오너 · 전용 페이지", roles: ["owner"] },
    ],
    []
  );

  const visibleAdminItems = useMemo(() => {
    if (!isAuthed || !isAdmin) return [];
    return adminItems.filter((it) => it.roles.includes(role));
  }, [adminItems, isAuthed, isAdmin, role]);

  // 바깥 클릭 / ESC 닫기
  useEffect(() => {
    if (!adminOpen) return;

    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const wrap = adminWrapRef.current;
      if (!wrap) return;
      if (!wrap.contains(target)) setAdminOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAdminOpen(false);
        adminBtnRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onDown, { passive: true });
    document.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [adminOpen]);

  return (
    <header className="premiumNav">
      <div className="premiumNavInner">
        {/* Brand */}
        <Link to="/" className="navBrand" aria-label="타이어 FLEX 홈" onClick={() => setAdminOpen(false)}>
          <img src={logo} alt="타이어 FLEX" />
          <div className="navBrandText">
            <span className="navBrandTitle">TIRE FLEX</span>
            <span className="navBrandSub">031-355-0018</span>
          </div>
        </Link>

        {/* Menu (일반 메뉴만 유지) */}
        <nav className="navMenu" aria-label="주요 메뉴">
          <Link to="/" onClick={() => setAdminOpen(false)}>
            홈
          </Link>
          <Link to="/book" onClick={() => setAdminOpen(false)}>
            예약
          </Link>
          <Link to="/onboarding" onClick={() => setAdminOpen(false)}>
            프로필
          </Link>
          <Link to="/my/history" onClick={() => setAdminOpen(false)}>
            내 정비내역
          </Link>
        </nav>

        {/* Actions */}
        <div className="navActions" ref={adminWrapRef}>
          {isAuthed && isAdmin && visibleAdminItems.length > 0 ? (
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 10 }}>
              <button
                ref={adminBtnRef}
                type="button"
                className="navBtn"
                aria-haspopup="menu"
                aria-expanded={adminOpen}
                onClick={() => setAdminOpen((v) => !v)}
              >
                관리자 메뉴 ▾
              </button>

              {adminOpen ? (
                <div
                  role="menu"
                  aria-label="관리자 메뉴"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 10px)",
                    minWidth: 220,
                    padding: 10,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(12,18,32,0.94)",
                    boxShadow: "0 18px 46px rgba(0,0,0,0.45)",
                    backdropFilter: "blur(10px)",
                    zIndex: 50,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      opacity: 0.85,
                      padding: "6px 8px 8px",
                      color: "rgba(255,255,255,0.92)",
                    }}
                  >
                    권한: {role.toUpperCase()}
                  </div>

                  <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "2px 0 6px" }} />

                  {visibleAdminItems.map((it) => (
                    <Link
                      key={it.to}
                      to={it.to}
                      role="menuitem"
                      onClick={() => setAdminOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 10px",
                        borderRadius: 12,
                        textDecoration: "none",
                        color: "rgba(255,255,255,0.92)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <span style={{ fontWeight: 900 }}>{it.label}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {isAuthed ? (
            <button type="button" className="navBtn" onClick={handleLogout}>
              로그아웃
            </button>
          ) : (
            <Link to="/auth" className="navBtn primary">
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
