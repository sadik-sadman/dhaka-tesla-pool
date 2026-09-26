"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPaisa } from "@/lib/money";
import { RideRequest } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

interface Props {
  rideRequests: RideRequest[];
  token: string;
  onCancelled: (rideRequest: RideRequest) => void;
}

const CANCELLABLE = new Set(["REQUESTED", "MATCHED_ACCEPTED"]);

export function RideList({ rideRequests, token, onCancelled }: Props) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setError(null);
    setCancellingId(id);
    try {
      const updated = await apiFetch<RideRequest>(`/api/rides/${id}/cancel`, {
        method: "POST",
        token,
      });
      onCancelled(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel this ride.");
    } finally {
      setCancellingId(null);
    }
  }

  if (rideRequests.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No rides yet -- request one above.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {rideRequests.map((ride) => (
        <div
          key={ride.id}
          className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              {ride.pickupZone.name} &rarr; {ride.destinationZone.name}
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {ride.seatsRequested} seat{ride.seatsRequested > 1 ? "s" : ""} &middot;{" "}
              {ride.finalFarePaisa ? (
                <>Final: {formatPaisa(ride.finalFarePaisa)}</>
              ) : (
                <>Est. {formatPaisa(ride.estimatedFarePaisa)}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={ride.status} />
            {CANCELLABLE.has(ride.status) && (
              <button
                onClick={() => handleCancel(ride.id)}
                disabled={cancellingId === ride.id}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                {cancellingId === ride.id ? "Cancelling..." : "Cancel"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
