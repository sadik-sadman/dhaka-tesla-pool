"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { DriverDashboardState, Pool, RideRequest, Vehicle, Zone } from "@/lib/types";
import { DriverStatusToggle } from "./DriverStatusToggle";
import { RelevantRequests } from "./RelevantRequests";
import { ActivePool } from "./ActivePool";
import { RideHistory } from "./RideHistory";

// Same polling approach as the passenger dashboard -- see
// docs/tech-justifications.md and app/passenger/page.tsx.
const POLL_INTERVAL_MS = 4000;

export default function DriverDashboard() {
  const { user, token, loading, logout } = useRequireAuth();
  const router = useRouter();
  const [zones, setZones] = useState<Zone[]>([]);
  const [dashboard, setDashboard] = useState<DriverDashboardState | null>(null);
  const [relevantRequests, setRelevantRequests] = useState<RideRequest[]>([]);
  const [history, setHistory] = useState<Pool[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zonesLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      // Retried alongside everything else below instead of a separate
      // one-shot fetch-on-mount: that version had the exact same silent-
      // failure gap as the dashboard fetch used to (see the comment below)
      // -- one bad tick left the zone dropdown permanently empty and
      // "Online at Banani" permanently degraded to just "Online", with no
      // way to recover short of a full page reload timed against a working
      // backend. zonesLoadedRef, not `zones.length`, so this doesn't need
      // `zones` in refresh's own dependency array (which would tear down
      // and rebuild the poll interval every time it changed).
      if (!zonesLoadedRef.current) {
        const zoneList = await apiFetch<Zone[]>("/api/zones", { token });
        setZones(zoneList);
        zonesLoadedRef.current = true;
      }
      const state = await apiFetch<DriverDashboardState>("/api/driver/dashboard", { token });
      setDashboard(state);
      if (state.vehicle.status === "ONLINE" && !state.pool) {
        const requests = await apiFetch<RideRequest[]>("/api/driver/requests", { token });
        setRelevantRequests(requests);
      } else {
        setRelevantRequests([]);
      }
      const pastTrips = await apiFetch<Pool[]>("/api/driver/history", { token });
      setHistory(pastTrips);
      // Only on success -- a transient poll failure after the page is
      // already showing real data isn't worth surfacing (the next tick
      // tries again), but marking the *first* load "done" from the finally
      // block below used to do that unconditionally: if that first request
      // hit a transient hiccup, the page flipped past "Loading..." straight
      // to rendering with dashboard still null, so the whole vehicle card
      // silently vanished instead of the page just staying in its loading
      // state until a real answer came back.
      setInitialLoadDone(true);
    } catch {
      // Swallowed here deliberately -- see the comment above for why this
      // must NOT also flip initialLoadDone.
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    queueMicrotask(refresh);

    pollRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, refresh]);

  if (loading || !user) {
    return null;
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  function handleVehicleChanged(vehicle: Vehicle) {
    setDashboard((prev) => (prev ? { ...prev, vehicle } : { vehicle, pool: null }));
    refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Welcome, {user.name}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Profile
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Log out
          </button>
        </div>
      </div>

      {!initialLoadDone ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading your dashboard...</p>
      ) : (
        <>
          {dashboard && (
            <DriverStatusToggle
              vehicle={dashboard.vehicle}
              zones={zones}
              token={token!}
              onChanged={handleVehicleChanged}
            />
          )}

          {dashboard?.pool ? (
            <ActivePool pool={dashboard.pool} token={token!} onChanged={refresh} />
          ) : (
            dashboard?.vehicle.status === "ONLINE" && (
              <RelevantRequests requests={relevantRequests} token={token!} onAccepted={refresh} />
            )
          )}

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Ride history</h2>
            <RideHistory pools={history} />
          </div>
        </>
      )}
    </div>
  );
}
