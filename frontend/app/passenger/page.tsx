"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RideRequest, Zone } from "@/lib/types";
import { useSerialPolling } from "@/lib/use-serial-polling";
import { RequestRideForm } from "./RequestRideForm";
import { RideList } from "./RideList";

// Simple polling, not a websocket/SSE push -- there's no requirement for
// true real-time updates at MVP scale, and Section 9 explicitly says not to
// add infrastructure just to look advanced. See docs/tech-justifications.md.
const POLL_INTERVAL_MS = 4000;

export default function PassengerDashboard() {
  const { user, token, loading, logout } = useRequireAuth();
  const router = useRouter();
  const [zones, setZones] = useState<Zone[]>([]);
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const zonesLoadedRef = useRef(false);
  const requestSeqRef = useRef(0);

  const refreshRides = useCallback(async () => {
    if (!token) return;
    // See driver/page.tsx's refresh() for the full reasoning: nothing
    // cancels an older in-flight poll tick, so on a machine with variable
    // response times an older, slower request can resolve *after* a newer
    // one and overwrite fresher state with stale data. This makes a
    // response a no-op once a newer refreshRides() call has already
    // started, regardless of which one's round-trip finishes first.
    const seq = ++requestSeqRef.current;
    const [ridesResult, zonesResult] = await Promise.allSettled([
      apiFetch<RideRequest[]>("/api/rides", { token }),
      zonesLoadedRef.current
        ? Promise.resolve<Zone[] | null>(null)
        : apiFetch<Zone[]>("/api/zones", { token }),
    ]);

    if (seq !== requestSeqRef.current) return;
    if (zonesResult.status === "fulfilled" && zonesResult.value) {
      setZones(zonesResult.value);
      zonesLoadedRef.current = true;
    }
    if (ridesResult.status === "fulfilled") {
      setRideRequests(ridesResult.value);
      setInitialLoadDone(true);
    }
  }, [token]);

  useSerialPolling(refreshRides, POLL_INTERVAL_MS, Boolean(token));

  if (loading || !user) {
    return null;
  }

  function handleLogout() {
    logout();
    router.replace("/login");
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
          <RequestRideForm
            zones={zones}
            token={token!}
            onRequested={(rideRequest) => setRideRequests((prev) => [rideRequest, ...prev])}
          />

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Your rides</h2>
            <RideList
              rideRequests={rideRequests}
              token={token!}
              onCancelled={(updated) =>
                setRideRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
