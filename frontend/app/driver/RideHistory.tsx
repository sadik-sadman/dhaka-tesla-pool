"use client";

import { formatPaisa } from "@/lib/money";
import { Pool } from "@/lib/types";

export function RideHistory({ pools }: { pools: Pool[] }) {
  if (pools.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No completed trips yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {pools.map((pool) => (
        <div
          key={pool.id}
          className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {pool.pickupZone?.name} pickup &middot;{" "}
            {pool.completedAt ? new Date(pool.completedAt).toLocaleString() : ""}
          </p>
          {pool.rideRequests.map((member) => (
            <div key={member.id} className="flex items-center justify-between text-sm">
              <span className="text-zinc-900 dark:text-zinc-50">
                {member.passenger?.name} &rarr; {member.destinationZone.name}
                {member.status === "CANCELLED" && (
                  <span className="ml-2 text-xs text-zinc-400">(cancelled)</span>
                )}
              </span>
              {member.finalFarePaisa && (
                <span className="text-zinc-500 dark:text-zinc-400">
                  {formatPaisa(member.finalFarePaisa)}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
