// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

import ProtectedRoute from "./routes/ProtectedRoute";
import Navbar from "./components/Navbar";

import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import BookPage from "./pages/BookPage";
import MyServiceHistoryPage from "./pages/MyServiceHistoryPage";

import AdminServicesPage from "./pages/admin/AdminServicesPage";
import AdminOpsPage from "./pages/admin/AdminOpsPage";
import AdminCalendarPage from "./pages/AdminCalendarPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminStaffPage from "./pages/admin/AdminStaffPage";
import OwnerStaffPage from "./pages/admin/OwnerStaffPage";

import DebugPage from "./pages/DebugPage";

import "./styles/appShell.css";

/* ======================
   Types
====================== */
type AppRole = "owner" | "staff" | "member";

type SessionState = {
  loading: boolean;
  userId: string | null;
  role: AppRole;
  isAdmin: boolean; // staff || owner
  error: string | null;
};

/* ======================
   RPC helpers
====================== */
async function fetchRole(): Promise<AppRole> {
  const { data, error } = await supabase.rpc("get_my_role");
  if (error) return "member";

  const r = String(data ?? "member");
  return r === "owner" || r === "staff" || r === "member" ? r : "member";
}

/* ======================
   Layout
====================== */
function AppLayout({ session, isAuthed }: { session: SessionState; isAuthed: boolean }) {
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

      <footer className="appFooter">...</footer>
    </div>
  );
}

/* ======================
   App Inner
====================== */
function AppInner() {
  const [session, setSession] = useState<SessionState>({
    loading: true,
    userId: null,
    role: "member",
    isAdmin: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      if (!mounted) return;
      setSession((prev) =>
        prev.loading
          ? {
              ...prev,
              loading: false,
              error: prev.error ?? "세션 로딩이 지연됩니다.",
            }
          : prev
      );
    }, 4000);

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;

        if (error) {
          setSession({
            loading: false,
            userId: null,
            role: "member",
            isAdmin: false,
            error: error.message,
          });
          return;
        }

        const uid = data.session?.user?.id ?? null;
        let role: AppRole = "member";

        if (uid) {
          role = await fetchRole();
        }

        if (!mounted) return;
        setSession({
          loading: false,
          userId: uid,
          role,
          isAdmin: role === "owner" || role === "staff",
          error: null,
        });
      } catch (e: any) {
        if (!mounted) return;
        setSession({
          loading: false,
          userId: null,
          role: "member",
          isAdmin: false,
          error: e?.message ?? String(e),
        });
      }
    };

    loadSession();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      const uid = s?.user?.id ?? null;
      let role: AppRole = "member";

      if (uid) {
        role = await fetchRole();
      }

      if (!mounted) return;
      setSession({
        loading: false,
        userId: uid,
        role,
        isAdmin: role === "owner" || role === "staff",
        error: null,
      });
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAuthed = useMemo(() => !!session.userId, [session.userId]);
  const isOwner = session.role === "owner";
  const isStaffOrOwner = session.role === "staff" || session.role === "owner";

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
          path="/my/history"
          element={
            <ProtectedRoute isAllowed={isAuthed} redirectTo="/auth">
              <MyServiceHistoryPage />
            </ProtectedRoute>
          }
        />

        {/* 관리자 (staff + owner) */}
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

        {/* 회원 관리 (staff/owner) */}
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute isAllowed={isAuthed && isStaffOrOwner} redirectTo="/">
              <AdminUsersPage />
            </ProtectedRoute>
          }
        />

        {/* 직원 관리 (owner only) */}
        <Route
          path="/admin/staff"
          element={
            <ProtectedRoute isAllowed={isAuthed && isOwner} redirectTo="/">
              <AdminStaffPage />
            </ProtectedRoute>
          }
        />

        {/* 최고관리자 전용 */}
        <Route
          path="/owner/staff"
          element={
            <ProtectedRoute isAllowed={isAuthed && isOwner} redirectTo="/">
              <OwnerStaffPage />
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
      <AppInner />
    </BrowserRouter>
  );
}
