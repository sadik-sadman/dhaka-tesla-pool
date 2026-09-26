"use client";

import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth-context";

export default function PassengerDashboard() {
  const { user, loading, logout } = useRequireAuth();
  const router = useRouter();

  if (loading || !user) {
    return null;
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-6 py-16 dark:bg-black">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Welcome, {user.name}
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Passenger dashboard -- request a ride, track status, and view history land here next.
      </p>
      <button
        onClick={handleLogout}
        className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Log out
      </button>
    </div>
  );
}
