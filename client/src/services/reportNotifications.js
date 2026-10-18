import { useEffect, useState } from "react";
import { api } from "./api";

export const reportRead = () => window.dispatchEvent(new Event("report-read"));

export function useReportNotifications(userId) {
  const [state, setState] = useState({ userId: null, count: 0 });
  useEffect(() => {
    if (!userId) return;
    let active = true,
      request = 0;
    async function refresh() {
      const current = ++request;
      try {
        const { count } = await api.reports.unread();
        if (active && current === request) setState({ userId, count });
      } catch {
        /* Keep existing indicators during temporary connection failures. */
      }
    }
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("report-read", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("report-read", refresh);
    };
  }, [userId]);
  return state.userId === userId ? state.count : 0;
}
