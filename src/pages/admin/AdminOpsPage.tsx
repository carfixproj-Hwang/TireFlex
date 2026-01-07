// src/pages/admin/AdminOpsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import AdminSchedulePage from "./AdminSchedulePage";
import AdminReservationsPage from "./AdminReservationsPage";
import AdminBlockedTimesPage from "../AdminBlockedTimesPage";

type TabKey = "schedule" | "reservations" | "blocked";

function parseTab(v: string | null): TabKey | null {
  if (v === "schedule" || v === "reservations" || v === "blocked") return v;
  return null;
}

export default function AdminOpsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<TabKey>("schedule");

  // ✅ URL ?tab=... 로 진입하면 해당 탭으로 자동 전환
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const t = parseTab(sp.get("tab"));
    if (t && t !== tab) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const subtitle = useMemo(() => {
    switch (tab) {
      case "schedule":
        return "하루 스케줄/타임라인";
      case "reservations":
        return "예약 목록 + 상태 변경";
      case "blocked":
        return "차단 추가/해제";
      default:
        return "";
    }
  }, [tab]);

  const setTabAndSyncUrl = (next: TabKey) => {
    setTab(next);
    const sp = new URLSearchParams(location.search);
    sp.set("tab", next); // ✅ date, focus 등 다른 파라미터는 유지
    navigate({ pathname: location.pathname, search: `?${sp.toString()}` }, { replace: true });
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: "8px 0 4px" }}>관리자 운영</h2>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{subtitle}</div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TabButton active={tab === "schedule"} onClick={() => setTabAndSyncUrl("schedule")}>
            스케줄
          </TabButton>
          <TabButton active={tab === "reservations"} onClick={() => setTabAndSyncUrl("reservations")}>
            예약관리
          </TabButton>
          <TabButton active={tab === "blocked"} onClick={() => setTabAndSyncUrl("blocked")}>
            차단관리
          </TabButton>
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        {tab === "schedule" ? <AdminSchedulePage /> : null}
        {tab === "reservations" ? <AdminReservationsPage /> : null}
        {tab === "blocked" ? <AdminBlockedTimesPage /> : null}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 12px",
        cursor: "pointer",
        borderRadius: 10,
        border: active ? "1px solid #111827" : "1px solid #e5e7eb",
        background: active ? "#111827" : "#ffffff",
        color: active ? "#ffffff" : "#111827",
        fontWeight: 800,
      }}
    >
      {children}
    </button>
  );
}
