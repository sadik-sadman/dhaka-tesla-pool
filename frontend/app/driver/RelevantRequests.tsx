"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPaisa } from "@/lib/money";
import { RideRequest } from "@/lib/types";

interface Props {
  requests: RideRequest[];
  token: string;
  onAccepted: () => void;
}

export function RelevantRequests({ requests, token, onAccepted }: Props) {
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setError(null);
    setAcceptingId(id);
    try {
      await apiFetch(`/api/driver/requests/${id}/accept`, { method: "POST", token });
      onAccepted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept this request.");
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Relevant requests</h2>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {requests.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No pending requests at your current zone right now.
        </p>
      ) : (
        requests.map((req) => (
          <div
            key={req.id}
            className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {req.passenger?.name} &middot; {req.pickupZone.name} &rarr; {req.destinationZone.name}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {req.seatsRequested} seat{req.seatsRequested > 1 ? "s" : ""} &middot; Est.{" "}
                {formatPaisa(req.estimatedFarePaisa)}
              </p>
            </div>
            <button
              onClick={() => handleAccept(req.id)}
              disabled={acceptingId === req.id}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {acceptingId === req.id ? "Accepting..." : "Accept"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
