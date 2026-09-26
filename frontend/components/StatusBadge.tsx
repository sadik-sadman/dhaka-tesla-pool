import { RideStatus } from "@/lib/types";

const LABELS: Record<RideStatus, string> = {
  REQUESTED: "Waiting for a driver",
  MATCHED_ACCEPTED: "Matched",
  DRIVER_ARRIVED: "Driver arrived",
  STARTED: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const COLORS: Record<RideStatus, string> = {
  REQUESTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  MATCHED_ACCEPTED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  DRIVER_ARRIVED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  STARTED: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  CANCELLED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function StatusBadge({ status }: { status: RideStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}
