"use client";

import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPaisa } from "@/lib/money";
import { RideRequest } from "@/lib/types";

interface Props {
  requests: RideRequest[];
  token: string;
  onAccepted: () => void;
  onDeclined: () => void;
  /** Override the section heading; defaults to "Relevant requests". */
  heading?: string;
  /**
   * When false the Accept button is shown but disabled with a tooltip —
   * the current trip must be completed before a new passenger can be accepted.
   * Defaults to true (window open).
   */
  acceptEnabled?: boolean;
}

export function RelevantRequests({
  requests,
  token,
  onAccepted,
  onDeclined,
  heading = "Relevant requests",
  acceptEnabled = true,
}: Props) {
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setError(null);
    setActionId(id);
    setActionType("accept");
    try {
      await apiFetch(`/api/driver/requests/${id}/accept`, { method: "POST", token });
      onAccepted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept this request.");
    } finally {
      setActionId(null);
      setActionType(null);
    }
  }

  async function handleDecline(id: string) {
    setError(null);
    setActionId(id);
    setActionType("decline");
    try {
      await apiFetch(`/api/driver/requests/${id}/decline`, { method: "POST", token });
      onDeclined();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not decline this request.");
    } finally {
      setActionId(null);
      setActionType(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{heading}</h2>
        {!acceptEnabled && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Complete current trip to accept
          </span>
        )}
      </div>

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
        requests.map((req) => {
          const isActing = actionId === req.id;
          return (
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

              <div className="flex items-center gap-2">
                {/* Decline / cancel button — always available */}
                <button
                  onClick={() => handleDecline(req.id)}
                  disabled={isActing}
                  title="Cancel this passenger's request"
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-700 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  {isActing && actionType === "decline" ? "Cancelling..." : "Cancel"}
                </button>

                {/* Accept button — disabled when pooling window is closed */}
                <button
                  onClick={() => handleAccept(req.id)}
                  disabled={isActing || !acceptEnabled}
                  title={
                    !acceptEnabled
                      ? "Complete your current trip first to accept a new passenger"
                      : "Accept this passenger"
                  }
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {isActing && actionType === "accept" ? "Accepting..." : "Accept"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
