// src/components/RestoreLastRouteOnReload.tsx
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const KEY = "last_route_v1";

function isReloadNavigation() {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === "reload";
  } catch {
    return false;
  }
}

export default function RestoreLastRouteOnReload() {
  const loc = useLocation();
  const nav = useNavigate();
  const didInit = useRef(false);

  useEffect(() => {
    const now = `${loc.pathname}${loc.search}${loc.hash}`;

    if (!didInit.current) {
      didInit.current = true;

      if (isReloadNavigation()) {
        const last = sessionStorage.getItem(KEY);
        if (now === "/" && last && last !== "/") {
          nav(last, { replace: true });
          return;
        }
      }
    }

    sessionStorage.setItem(KEY, now);
  }, [loc.pathname, loc.search, loc.hash, nav]);

  return null;
}
