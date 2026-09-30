"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { formatPaisa } from "@/lib/money";
import { DriverDashboardState, PublicUser, Zone } from "@/lib/types";
import { useSerialPolling } from "@/lib/use-serial-polling";

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
    const [profileResult, vehicleResult, zonesResult] = await Promise.allSettled([
      apiFetch<PublicUser>("/api/auth/me", { token }),
      user.role === "DRIVER"
        ? apiFetch<DriverDashboardState>("/api/driver/dashboard", { token })
        : Promise.resolve<DriverDashboardState | null>(null),
      user.role === "DRIVER" && !zonesLoadedRef.current
        ? apiFetch<Zone[]>("/api/zones", { token })
        : Promise.resolve<Zone[] | null>(null),
    ]);

    if (seq !== requestSeqRef.current) return;

    if (profileResult.status === "fulfilled") setProfile(profileResult.value);
    if (vehicleResult.status === "fulfilled" && vehicleResult.value) {
      setVehicle(vehicleResult.value.vehicle);
    }
    if (zonesResult.status === "fulfilled" && zonesResult.value) {
      setZones(zonesResult.value);
      zonesLoadedRef.current = true;
    }

    const essentialDataLoaded =
      profileResult.status === "fulfilled" &&
      (user.role !== "DRIVER" || (vehicleResult.status === "fulfilled" && vehicleResult.value !== null));
    if (essentialDataLoaded) {
      setInitialLoadDone(true);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
  }, [token, user]);

  useSerialPolling(load, POLL_INTERVAL_MS, Boolean(token && user));

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
              onClick={load}
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
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Status</span>
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${
                    vehicle.status === "ONLINE"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${vehicle.status === "ONLINE" ? "bg-emerald-500" : "bg-zinc-400"}`}
                  />
                  {vehicle.status === "ONLINE" ? "Online" : "Offline"}
                </span>
              </div>
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
