"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { Vehicle, Zone } from "@/lib/types";

interface Props {
  vehicle: Vehicle;
  zones: Zone[];
  token: string;
  onChanged: (vehicle: Vehicle) => void;
}

export function DriverStatusToggle({ vehicle, zones, token, onChanged }: Props) {
  const [zoneId, setZoneId] = useState(vehicle.currentZoneId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function goOnline() {
    if (!zoneId) {
      setError("Pick your current zone first.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiFetch<Vehicle>("/api/driver/status", {
        method: "PATCH",
        token,
        body: { status: "ONLINE", currentZoneId: zoneId },
      });
      onChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not go online.");
    } finally {
      setSubmitting(false);
    }
  }

  async function goOffline() {
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiFetch<Vehicle>("/api/driver/status", {
        method: "PATCH",
        token,
        body: { status: "OFFLINE" },
      });
      onChanged(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not go offline.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            {vehicle.name} &middot; {vehicle.capacity} seats
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {vehicle.status === "ONLINE" ? "Online" : "Offline"}
          </p>
        </div>

        {vehicle.status === "ONLINE" ? (
          <button
            onClick={goOffline}
            disabled={submitting}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Go offline
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="" disabled>
                Current zone
              </option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
            <button
              onClick={goOnline}
              disabled={submitting}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Go online
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
