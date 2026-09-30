"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPaisa } from "@/lib/money";
import { Pool } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

interface Props {
  pool: Pool;
  token: string;
  onChanged: () => void;
}

const NEXT_ACTION: Partial<Record<Pool["status"], { label: string; path: string }>> = {
  MATCHED_ACCEPTED: { label: "Mark arrived", path: "/api/driver/pool/arrived" },
  DRIVER_ARRIVED: { label: "Start trip", path: "/api/driver/pool/start" },
  STARTED: { label: "Complete trip", path: "/api/driver/pool/complete" },
};

export function ActivePool({ pool, token, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const action = NEXT_ACTION[pool.status];

  // Can only remove passengers while the pooling window is still open
  const canRemoveMembers = pool.status === "MATCHED_ACCEPTED";

  async function handleAction() {
    if (!action) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(action.path, { method: "POST", token });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the trip.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveMember(rideRequestId: string) {
    setError(null);
    setRemovingId(rideRequestId);
    try {
      await apiFetch(`/api/driver/pool/members/${rideRequestId}/remove`, {
        method: "POST",
        token,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove this passenger.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Active trip</h2>
        <StatusBadge status={pool.status} />
      </div>

      <div className="flex flex-col gap-2">
        {pool.rideRequests.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                {member.passenger?.name}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {" "}
                &middot; {member.pickupZone.name} &rarr; {member.destinationZone.name}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-zinc-500 dark:text-zinc-400">
                {formatPaisa(member.estimatedFarePaisa)}
              </span>
              {/* Remove button: only visible while pooling window is open */}
              {canRemoveMembers && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={removingId === member.id}
                  title="Remove this passenger from the pool"
                  className="rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  {removingId === member.id ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </div>
        ))}

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {pool.occupiedSeats} seat{pool.occupiedSeats !== 1 ? "s" : ""} occupied
        </p>

        {pool.status === "MATCHED_ACCEPTED" && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            ● Pooling window open — you can still accept more passengers or remove existing ones
            below before marking arrived.
          </p>
        )}
        {pool.status === "DRIVER_ARRIVED" && (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            ● Pooling window closed — start the trip when all passengers are on board.
          </p>
        )}
        {pool.status === "STARTED" && (
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
            ● Trip in progress — new passengers waiting below will be served after this trip
            completes.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {action && (
        <button
          onClick={handleAction}
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? "Working..." : action.label}
        </button>
      )}
    </div>
  );
}
