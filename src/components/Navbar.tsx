import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/tireflex-logo.png";
import "../styles/navbarPremium.css";
import { supabase } from "../lib/supabaseClient";

type Props = {
  isAuthed: boolean;
  isAdmin: boolean;
};

export default function Navbar({ isAuthed, isAdmin }: Props) {
  const nav = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav("/auth");
  };

  return (
    <header className="premiumNav">
      <div className="premiumNavInner">
        {/* Brand */}
        <Link to="/" className="navBrand" aria-label="타이어 FLEX 홈">
          <img src={logo} alt="타이어 FLEX" />
          <div className="navBrandText">
            <span className="navBrandTitle">TIRE FLEX</span>
            <span className="navBrandSub">031-355-0018</span>
          </div>
        </Link>

        {/* Menu */}
        <nav className="navMenu" aria-label="주요 메뉴">
          <Link to="/">홈</Link>
          <Link to="/book">예약</Link>
          <Link to="/onboarding">프로필</Link>

          {isAdmin ? (
            <>
              <span className="navDivider" aria-hidden />
              <Link to="/admin/services" className="navAdminLink">
                관리자 · 아이템
              </Link>
              <Link to="/admin" className="navAdminLink">
                관리자 · 운영
              </Link>
              <Link to="/admin/calendar" className="navAdminLink">
                관리자 · 달력
              </Link>
            </>
          ) : null}
        </nav>

        {/* Actions */}
        <div className="navActions">
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
