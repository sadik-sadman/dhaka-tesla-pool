"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useSerialPolling } from "@/lib/use-serial-polling";
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
  const [loadError, setLoadError] = useState(false);
  const zonesLoadedRef = useRef(false);
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!token) return;
    // Every refresh() call (poll tick, or a manual one right after an
    // action like "Go online") fires its own independent set of requests --
    // nothing cancels an older one that's still in flight. On a machine
    // with variable response times, an older, slower request can resolve
    // *after* a newer one and overwrite fresher state with stale data (the
    // dashboard flipping back to "Offline" moments after actually going
    // online, no matter how correct the write itself was). This sequence
    // number makes a response a no-op once a newer refresh() has already
    // started, regardless of which one's network round-trip happens to
    // finish first.
    const seq = ++requestSeqRef.current;
    // The dashboard, history and (until loaded once) zones are independent.
    // Fetching them together keeps a slow history query from delaying the
    // authoritative vehicle status or making the vehicle card disappear.
    const [stateResult, historyResult, zonesResult] = await Promise.allSettled([
      apiFetch<DriverDashboardState>("/api/driver/dashboard", { token }),
      apiFetch<Pool[]>("/api/driver/history", { token }),
      zonesLoadedRef.current
        ? Promise.resolve<Zone[] | null>(null)
        : apiFetch<Zone[]>("/api/zones", { token }),
    ]);

    if (seq !== requestSeqRef.current) return;

    if (zonesResult.status === "fulfilled" && zonesResult.value) {
      setZones(zonesResult.value);
      zonesLoadedRef.current = true;
    }
    if (historyResult.status === "fulfilled") {
      setHistory(historyResult.value);
    }
    if (stateResult.status === "rejected") {
      setLoadError(true);
      return;
    }

    const state = stateResult.value;
    setDashboard(state);
    setInitialLoadDone(true);
    setLoadError(false);

    // Fetch pending requests whenever the vehicle is ONLINE — even with an
    // active pool — as long as the pooling window is still open
    // (MATCHED_ACCEPTED). Once the driver marks arrived the window closes
    // (DRIVER_ARRIVED / STARTED) and we clear the list.
    const poolingWindowOpen =
      state.vehicle.status === "ONLINE" &&
      (!state.pool || state.pool.status === "MATCHED_ACCEPTED");

    if (poolingWindowOpen) {
      try {
        const requests = await apiFetch<RideRequest[]>("/api/driver/requests", { token });
        if (seq === requestSeqRef.current) setRelevantRequests(requests);
      } catch {
        // Keep the last successful list and retry on the next poll.
      }
    } else if (seq === requestSeqRef.current) {
      setRelevantRequests([]);
    }
  }, [token]);

  useSerialPolling(refresh, POLL_INTERVAL_MS, Boolean(token));

  if (loading || !user) {
    return null;
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  function handleVehicleChanged(vehicle: Vehicle) {
    // Bump the sequence *before* setting state -- otherwise an older poll
    // tick's response, already in flight when this PATCH resolved, could
    // still land right after this and overwrite it with stale data (see
    // the comment on requestSeqRef in refresh() above).
    requestSeqRef.current += 1;
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
        loadError ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load your vehicle details. Your saved driver status has not been changed.
            </p>
            <button
              onClick={refresh}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading your dashboard...</p>
        )
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

          {/* While a pool is open but not yet started, the driver can still
              accept more passengers into it — show remaining pending requests
              below the active pool card so they know more riders are waiting. */}
          {dashboard?.pool?.status === "MATCHED_ACCEPTED" && relevantRequests.length > 0 && (
            <RelevantRequests
              requests={relevantRequests}
              token={token!}
              onAccepted={refresh}
              heading="Add more passengers"
            />
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
