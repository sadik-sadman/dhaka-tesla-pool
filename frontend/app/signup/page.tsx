"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/FormField";
import { Role } from "@/lib/types";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>("PASSENGER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [vehicleCapacity, setVehicleCapacity] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await signup(
        role === "DRIVER"
          ? {
              role,
              name,
              email,
              password,
              vehicleName,
              vehicleCapacity: Number(vehicleCapacity),
            }
          : { role, name, email, password },
      );
      router.push(user.role === "DRIVER" ? "/driver" : "/passenger");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Sign up</h1>

        <div className="flex rounded-lg border border-zinc-300 p-1 dark:border-zinc-700">
          {(["PASSENGER", "DRIVER"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRole(option)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                role === option
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {option === "PASSENGER" ? "Passenger" : "Driver"}
            </button>
          ))}
        </div>

        <FormField id="name" label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <FormField
          id="email"
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {role === "DRIVER" && (
          <>
            <FormField
              id="vehicleName"
              label="Vehicle name"
              placeholder="e.g. Bullet"
              required
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
            />
            <FormField
              id="vehicleCapacity"
              label="Seat capacity"
              type="number"
              min={1}
              max={3}
              required
              value={vehicleCapacity}
              onChange={(e) => setVehicleCapacity(e.target.value)}
            />
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-full bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? "Signing up..." : "Sign up"}
        </button>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-900 underline dark:text-zinc-50">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
