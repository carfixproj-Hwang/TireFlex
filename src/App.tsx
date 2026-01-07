import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

import ProtectedRoute from "./routes/ProtectedRoute";

import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import BookPage from "./pages/BookPage";
import AdminServicesPage from "./pages/admin/AdminServicesPage";
import DebugPage from "./pages/DebugPage";

// ✅ 관리자 운영(스케줄/예약/차단 탭 통합)
import AdminOpsPage from "./pages/admin/AdminOpsPage";
import AdminCalendarPage from "./pages/AdminCalendarPage";

import "./styles/appShell.css";

type SessionState = {
  loading: boolean;
  userId: string | null;
  isAdmin: boolean;
  error: string | null;
};

async function fetchIsAdmin(uid: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin", { uid });
  if (error) return false;
  return Boolean(data);
}

function AppLayout({
  session,
  isAuthed,
}: {
  session: SessionState;
  isAuthed: boolean;
}) {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="appHeaderInner">
          <div className="appBrand">
            <div className="appBrandMark" aria-hidden />
            <div className="appBrandText">
              <div className="appBrandName">정비소 운영 플랫폼</div>
              <div className="appBrandSub">Metallic Showroom</div>
            </div>
          </div>

          <nav className="appNav">
            <Link className="appNavLink" to="/">
              홈
            </Link>
            <Link className="appNavLink" to="/book">
              예약
            </Link>
            <Link className="appNavLink" to="/onboarding">
              프로필
            </Link>

            {session.isAdmin ? (
              <>
                <span className="appNavDivider" aria-hidden />
                <Link className="appNavLink" to="/admin/services">
                  관리자:아이템
                </Link>
                <Link className="appNavLink" to="/admin">
                  관리자:운영
                </Link>
                <Link className="appNavLink" to="/admin/calendar">
                  관리자:달력
                </Link>
              </>
            ) : null}

            <span className="appNavDivider" aria-hidden />
            <Link className="appNavLink" to="/auth">
              인증
            </Link>
            {isAuthed ? <LogoutButton /> : null}
          </nav>
        </div>

        {session.error ? (
          <div className="appNotice">
            <div className="appNoticeInner">
              <span className="appNoticeDot" aria-hidden />
              <span>오류: {session.error}</span>
            </div>
          </div>
        ) : null}
      </header>

      <main className={isHome ? "appMain appMain--full" : "appMain appMain--contained"}>
        <Outlet />
      </main>

      <footer className="appFooter">
        <div className="appFooterInner">
          <span>© Car Service</span>
          <span className="appFooterSep" aria-hidden>
            ·
          </span>
          <span className="appFooterMuted">Supabase 기반 예약/운영 시스템</span>
        </div>
      </footer>
    </div>
  );
}

function AppInner() {
  const [session, setSession] = useState<SessionState>({
    loading: true,
    userId: null,
    isAdmin: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    const t = setTimeout(() => {
      if (!mounted) return;
      setSession((prev) =>
        prev.loading
          ? {
              ...prev,
              loading: false,
              error: prev.error ?? "세션 로딩이 지연됩니다. 콘솔/네트워크를 확인하세요.",
            }
          : prev
      );
    }, 4000);

    const load = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          setSession({ loading: false, userId: null, isAdmin: false, error: error.message });
          return;
        }

        const uid = data.session?.user?.id ?? null;

        let isAdmin = false;
        if (uid) isAdmin = await fetchIsAdmin(uid);

        if (!mounted) return;
        setSession({ loading: false, userId: uid, isAdmin, error: null });
      } catch (e: any) {
        if (!mounted) return;
        setSession({ loading: false, userId: null, isAdmin: false, error: e?.message ?? String(e) });
      }
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      const uid = s?.user?.id ?? null;
      let isAdmin = false;
      if (uid) isAdmin = await fetchIsAdmin(uid);

      if (!mounted) return;
      setSession({ loading: false, userId: uid, isAdmin, error: null });
    });

    return () => {
      mounted = false;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAuthed = useMemo(() => !!session.userId, [session.userId]);

  if (session.loading) {
    return (
      <div className="appBoot">
        <div className="appBootCard">
          <div className="appBootTitle">로딩중...</div>
          <div className="appBootSub">세션과 권한을 확인하고 있어요.</div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout session={session} isAuthed={isAuthed} />}>
        <Route path="/" element={<HomePage isAuthed={isAuthed} isAdmin={session.isAdmin} />} />
        <Route path="/auth" element={<AuthPage />} />

        <Route
          path="/onboarding"
          element={
            <ProtectedRoute isAllowed={isAuthed} redirectTo="/auth">
              <OnboardingPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/book"
          element={
            <ProtectedRoute isAllowed={isAuthed} redirectTo="/auth">
              <BookPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/services"
          element={
            <ProtectedRoute isAllowed={isAuthed && session.isAdmin} redirectTo="/">
              <AdminServicesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute isAllowed={isAuthed && session.isAdmin} redirectTo="/">
              <AdminOpsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/schedule"
          element={
            <ProtectedRoute isAllowed={isAuthed && session.isAdmin} redirectTo="/">
              <AdminOpsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reservations"
          element={
            <ProtectedRoute isAllowed={isAuthed && session.isAdmin} redirectTo="/">
              <AdminOpsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/calendar"
          element={
            <ProtectedRoute isAllowed={isAuthed && session.isAdmin} redirectTo="/">
              <AdminCalendarPage />
            </ProtectedRoute>
          }
        />

        <Route path="/debug" element={<DebugPage />} />
      </Route>
    </Routes>
  );
}

function LogoutButton() {
  const navigate = useNavigate();
  return (
    <button
      className="appNavBtn"
      onClick={async () => {
        await supabase.auth.signOut();
        navigate("/auth");
      }}
    >
      로그아웃
    </button>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
