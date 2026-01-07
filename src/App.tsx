import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";

import ProtectedRoute from "./routes/ProtectedRoute";
import Navbar from "./components/Navbar";

import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import BookPage from "./pages/BookPage";
import AdminServicesPage from "./pages/admin/AdminServicesPage";
import DebugPage from "./pages/DebugPage";

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

function AppLayout({ session, isAuthed }: { session: SessionState; isAuthed: boolean }) {
  return (
    <div className="appShell">
      <Navbar isAuthed={isAuthed} isAdmin={session.isAdmin} />

      {session.error ? (
        <div className="appNotice">
          <div className="appNoticeInner">
            <span className="appNoticeDot" aria-hidden />
            <span>오류: {session.error}</span>
          </div>
        </div>
      ) : null}

      {/* ✅ fixed navbar 높이만큼 아래로 내려서 어떤 페이지에서도 항상 보이게 */}
      <main className="appMain appMain--full" style={{ paddingTop: 64 }}>
        <Outlet />
      </main>

      <footer className="appFooter">...</footer>
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

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
