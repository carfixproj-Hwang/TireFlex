// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

import ProtectedRoute from "./routes/ProtectedRoute";
import Navbar from "./components/Navbar";
import RestoreLastRouteOnReload from "./components/RestoreLastRouteOnReload";

import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import BookPage from "./pages/BookPage";
import MyServiceHistoryPage from "./pages/MyServiceHistoryPage";

import AdminServicesPage from "./pages/admin/AdminServicesPage";
import AdminOpsPage from "./pages/admin/AdminOpsPage";
import AdminCalendarPage from "./pages/AdminCalendarPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import OwnerStaffPage from "./pages/admin/OwnerStaffPage";

import OwnerServiceHistoryPage from "./pages/owner/OwnerServiceHistoryPage";
import OwnerEstimatesPage from "./pages/owner/OwnerEstimatesPage";

import DebugPage from "./pages/DebugPage";

import "./styles/appShell.css";

/* ======================
   Types
====================== */
type AppRole = "owner" | "staff" | "member";

type SessionState = {
  loading: boolean;
  roleLoading: boolean; // ✅ 추가
  userId: string | null;
  role: AppRole;
  isAdmin: boolean;
  error: string | null;
};

/* ======================
   Utils
====================== */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(fallback);
    });
  });
}

/* ======================
   RPC helpers
====================== */
async function fetchRoleFast(): Promise<AppRole> {
  const p = (async () => {
    const { data, error } = await supabase.rpc("get_my_role");
    if (error) return "member";
    const r = String(data ?? "member");
    return r === "owner" || r === "staff" || r === "member" ? (r as AppRole) : "member";
  })();

  return withTimeout(p, 1200, "member");
}

/* ======================
   Layout
====================== */
function AppLayout({
  session,
  isAuthed,
}: {
  session: SessionState;
  isAuthed: boolean;
}) {
  return (
    <div className="appShell">
      <Navbar isAuthed={isAuthed} isAdmin={session.isAdmin} role={session.role} />

      {session.error && (
        <div className="appNotice">
          <div className="appNoticeInner">
            <span className="appNoticeDot" aria-hidden />
            <span>오류: {session.error}</span>
          </div>
        </div>
      )}

      <main className="appMain appMain--full" style={{ paddingTop: 64 }}>
        <Outlet />
      </main>

      <footer className="appFooter">
        <div className="appFooterInner">
          <div className="appFooterBlock">
            <strong>타이어FLEX</strong><br />
            <span>대표자 : 이정준</span><br />
            <span>사업자등록번호 : 775-53-00721</span>
          </div>

          <div className="appFooterBlock">
            <strong>Contact</strong><br />
            <span>전화 : 031-352-0114</span><br />
            <span>휴대폰 : 010-6677-8298</span>
          </div>

          <div className="appFooterBlock">
            <strong>Location</strong><br />
            <span>경기도 화성시 남양읍 화성로 1255</span><br />
            <span>
              1255, Hwaseong-ro, Namyang-eup, Hwaseong-si, Gyeonggi-do, Republic of
              Korea
            </span>
          </div>
        </div>

        <div className="appFooterCopy">
          © {new Date().getFullYear()} TireFLEX. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

/* ======================
   App Inner
====================== */
function AppInner() {
  const [session, setSession] = useState<SessionState>({
    loading: true,
    roleLoading: false, // ✅ 추가
    userId: null,
    role: "member",
    isAdmin: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    const bootTimer = setTimeout(() => {
      if (!mounted) return;
      setSession((prev) => (prev.loading ? { ...prev, loading: false } : prev));
    }, 1500);

    const applyRoleAsync = async (uid: string) => {
      const role = await fetchRoleFast();
      if (!mounted) return;
      setSession((prev) =>
        prev.userId !== uid
          ? prev
          : {
              ...prev,
              role,
              isAdmin: role === "owner" || role === "staff",
              roleLoading: false, // ✅ role 확정
            }
      );
    };

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          setSession({
            loading: false,
            roleLoading: false,
            userId: null,
            role: "member",
            isAdmin: false,
            error: error.message,
          });
          return;
        }

        const uid = data.session?.user?.id ?? null;

        setSession({
          loading: false,
          roleLoading: !!uid, // ✅ 로그인 상태면 role 로딩 시작
          userId: uid,
          role: "member",
          isAdmin: false,
          error: null,
        });

        if (uid) applyRoleAsync(uid);
      } catch (e: any) {
        if (!mounted) return;
        setSession({
          loading: false,
          roleLoading: false,
          userId: null,
          role: "member",
          isAdmin: false,
          error: e?.message ?? String(e),
        });
      }
    };

    loadSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const uid = s?.user?.id ?? null;

      setSession({
        loading: false,
        roleLoading: !!uid, // ✅ 로그인 상태면 role 로딩 시작
        userId: uid,
        role: "member",
        isAdmin: false,
        error: null,
      });

      if (uid) applyRoleAsync(uid);
    });

    return () => {
      mounted = false;
      clearTimeout(bootTimer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAuthed = useMemo(() => !!session.userId, [session.userId]);
  const isOwner = session.role === "owner";
  const isStaffOrOwner = session.role === "staff" || session.role === "owner";

  // ✅ roleLoading 중에는 라우트 판단(redirect) 자체를 막아서 F5해도 현재 URL 유지
  if (session.loading || session.roleLoading) {
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
          path="/my/history"
          element={
            <ProtectedRoute isAllowed={isAuthed} redirectTo="/auth">
              <MyServiceHistoryPage />
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
          path="/admin/calendar"
          element={
            <ProtectedRoute isAllowed={isAuthed && session.isAdmin} redirectTo="/">
              <AdminCalendarPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute isAllowed={isAuthed && isStaffOrOwner} redirectTo="/">
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/owner/staff"
          element={
            <ProtectedRoute isAllowed={isAuthed && isOwner} redirectTo="/">
              <OwnerStaffPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/owner/history"
          element={
            <ProtectedRoute isAllowed={isAuthed && isOwner} redirectTo="/">
              <OwnerServiceHistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/owner/estimates"
          element={
            <ProtectedRoute isAllowed={isAuthed && isOwner} redirectTo="/">
              <OwnerEstimatesPage />
            </ProtectedRoute>
          }
        />

        <Route path="/debug" element={<DebugPage />} />
      </Route>
    </Routes>
  );
}

/* ======================
   App Root
====================== */
export default function App() {
  return (
    <BrowserRouter>
      <RestoreLastRouteOnReload />
      <AppInner />
    </BrowserRouter>
  );
}
