"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { formatPaisa } from "@/lib/money";
import { DriverDashboardState, PublicUser, Zone } from "@/lib/types";

// Same polling approach as the dashboards (see app/driver/page.tsx) -- this
// page used to be a one-shot fetch on mount, which meant a read that raced
// ahead of a very recent write (e.g. landing here right after "Go online",
// before that PATCH had actually committed) showed a stale snapshot
// *forever*, with nothing to ever correct it. Polling makes that self-heal
// within one tick instead of needing a manual reload.
const POLL_INTERVAL_MS = 4000;

export default function ProfilePage() {
  const { user, token, loading, logout } = useRequireAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [vehicle, setVehicle] = useState<DriverDashboardState["vehicle"] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zonesLoadedRef = useRef(false);
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!token || !user) return;
    // See driver/page.tsx's refresh() for the full reasoning: nothing
    // cancels an older in-flight poll tick, so on a machine with variable
    // response times an older, slower request can resolve *after* a newer
    // one and overwrite fresher state with stale data -- e.g. landing on
    // this page shortly after "Go online" and having an older, still-in-
    // flight tick's response land after the newer one, showing "Offline"
    // for a vehicle that's actually online. This makes a response a no-op
    // once a newer load() call has already started, regardless of which
    // one's round-trip finishes first.
    const seq = ++requestSeqRef.current;
    try {
      const me = await apiFetch<PublicUser>("/api/auth/me", { token });
      const isStillLatest = seq === requestSeqRef.current;
      if (isStillLatest) {
        setProfile(me);
      }

      if (user.role === "DRIVER") {
        if (!zonesLoadedRef.current) {
          const zoneList = await apiFetch<Zone[]>("/api/zones", { token });
          if (seq === requestSeqRef.current) {
            setZones(zoneList);
            zonesLoadedRef.current = true;
          }
        }
        const dashboard = await apiFetch<DriverDashboardState>("/api/driver/dashboard", { token });
        if (seq === requestSeqRef.current) {
          setVehicle(dashboard.vehicle);
        }
      }
      // Only on success -- see driver/page.tsx's refresh() for the full
      // reasoning: a failed fetch must never be treated the same as a
      // successful one showing real (if empty) data.
      if (seq === requestSeqRef.current) {
        setInitialLoadDone(true);
        setLoadError(false);
      }
    } catch {
      if (seq === requestSeqRef.current) {
        setLoadError(true);
      }
    }
  }, [token, user]);

  useEffect(() => {
    if (!token || !user) return;

    queueMicrotask(load);

    pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, user, load, retryCount]);

  if (loading || !user) {
    return null;
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const currentZoneName = zones.find((z) => z.id === vehicle?.currentZoneId)?.name;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 bg-zinc-50 px-6 py-10 dark:bg-black">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Profile</h1>
        <div className="flex items-center gap-2">
          <Link
            href={user.role === "DRIVER" ? "/driver" : "/passenger"}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Dashboard
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
              Couldn&apos;t load your profile. Please try again.
            </p>
            <button
              onClick={() => setRetryCount((n) => n + 1)}
              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Retry
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading profile...</p>
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <Row label="Name" value={profile?.name ?? user.name} />
            <Row label="Email" value={profile?.email ?? user.email} />
            <Row label="Role" value={profile?.role === "DRIVER" ? "Driver" : "Passenger"} />
            <Row label="TeslaPay wallet" value={formatPaisa(profile?.walletBalancePaisa ?? user.walletBalancePaisa)} />
            <Row
              label={user.role === "DRIVER" ? "Cash collected" : "Cash paid"}
              value={formatPaisa(profile?.cashTotalPaisa ?? "0")}
            />
          </div>

          {user.role === "DRIVER" && vehicle && (
            <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Vehicle</h2>
              <Row label="Name" value={vehicle.name} />
              <Row label="Capacity" value={`${vehicle.capacity} seats`} />
              <Row label="Status" value={vehicle.status === "ONLINE" ? "Online" : "Offline"} />
              <Row label="Current zone" value={currentZoneName ?? "Not set"} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-medium text-zinc-900 dark:text-zinc-50">{value}</span>
    </div>
  );
}
