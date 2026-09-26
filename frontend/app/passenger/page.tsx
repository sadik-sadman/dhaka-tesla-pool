"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { RideRequest, Zone } from "@/lib/types";
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshRides = useCallback(async () => {
    if (!token) return;
    try {
      const rides = await apiFetch<RideRequest[]>("/api/rides", { token });
      setRideRequests(rides);
    } catch {
      // A transient poll failure isn't worth surfacing to the user -- the
      // next tick tries again.
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    apiFetch<Zone[]>("/api/zones", { token }).then(setZones).catch(() => setZones([]));
    queueMicrotask(refreshRides);

    pollRef.current = setInterval(refreshRides, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, refreshRides]);

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
        <button
          onClick={handleLogout}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Log out
        </button>
      </div>

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
    </div>
  );
}
