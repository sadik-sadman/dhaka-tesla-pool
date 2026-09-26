"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(user.role === "DRIVER" ? "/driver" : "/passenger");
    }
  }, [loading, user, router]);

  if (loading || user) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-50 px-6 text-center dark:bg-black">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dhaka Tesla Pool
        </h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
          Share a seat. Split the fare. Survive Dhaka traffic.
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-full bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-full border border-zinc-300 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
