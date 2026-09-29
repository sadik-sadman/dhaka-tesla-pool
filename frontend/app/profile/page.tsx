"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { formatPaisa } from "@/lib/money";
import { DriverDashboardState, PublicUser, Zone } from "@/lib/types";

export default function ProfilePage() {
  const { user, token, loading, logout } = useRequireAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [vehicle, setVehicle] = useState<DriverDashboardState["vehicle"] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  useEffect(() => {
    if (!token || !user) return;

    async function load() {
      try {
        const me = await apiFetch<PublicUser>("/api/auth/me", { token });
        setProfile(me);

        if (user!.role === "DRIVER") {
          const [dashboard, zoneList] = await Promise.all([
            apiFetch<DriverDashboardState>("/api/driver/dashboard", { token }),
            apiFetch<Zone[]>("/api/zones", { token }),
          ]);
          setVehicle(dashboard.vehicle);
          setZones(zoneList);
        }
      } catch {
        // A transient failure here just means stale/no data below --
        // nothing destructive, no retry loop needed for a profile view.
      } finally {
        setInitialLoadDone(true);
      }
    }
    queueMicrotask(load);
  }, [token, user]);

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
        <button
          onClick={handleLogout}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Log out
        </button>
      </div>

      {!initialLoadDone ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading profile...</p>
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
