"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { PaymentMethod, RideRequest, Zone } from "@/lib/types";

// Not-yet-submitted input is real work a passenger can lose to an accidental
// refresh or an errant back-button -- sessionStorage (not localStorage,
// since a draft shouldn't outlive the tab the way the auth token does)
// keeps it across a reload without needing a backend round-trip for
// something that isn't a ride yet.
const DRAFT_KEY = "dhaka-tesla-pool.request-ride-draft";

interface Draft {
  pickupZoneId: string;
  destinationZoneId: string;
  seatsRequested: string;
  paymentMethod: PaymentMethod;
}

function readDraft(): Partial<Draft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : {};
  } catch {
    return {};
  }
}

function writeDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private browsing / blocked storage -- the draft just won't survive a
    // reload, same degraded-not-broken fallback as the auth token.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clean up if storage was never reachable in the first place.
  }
}

interface Props {
  zones: Zone[];
  token: string;
  onRequested: (rideRequest: RideRequest) => void;
}

export function RequestRideForm({ zones, token, onRequested }: Props) {
  const [pickupZoneId, setPickupZoneId] = useState(() => readDraft().pickupZoneId ?? "");
  const [destinationZoneId, setDestinationZoneId] = useState(() => readDraft().destinationZoneId ?? "");
  const [seatsRequested, setSeatsRequested] = useState(() => readDraft().seatsRequested ?? "1");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => readDraft().paymentMethod ?? "CASH");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    writeDraft({ pickupZoneId, destinationZoneId, seatsRequested, paymentMethod });
  }, [pickupZoneId, destinationZoneId, seatsRequested, paymentMethod]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (pickupZoneId && pickupZoneId === destinationZoneId) {
      setError("Pickup and destination must be different.");
      return;
    }

    setSubmitting(true);
    try {
      const rideRequest = await apiFetch<RideRequest>("/api/rides", {
        method: "POST",
        token,
        body: {
          pickupZoneId,
          destinationZoneId,
          seatsRequested: Number(seatsRequested),
          paymentMethod,
        },
      });
      onRequested(rideRequest);
      setPickupZoneId("");
      setDestinationZoneId("");
      setSeatsRequested("1");
      clearDraft();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Request a ride</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="pickup" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Pickup
          </label>
          <select
            id="pickup"
            required
            value={pickupZoneId}
            onChange={(e) => setPickupZoneId(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="" disabled>
              Select a zone
            </option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="destination" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Destination
          </label>
          <select
            id="destination"
            required
            value={destinationZoneId}
            onChange={(e) => setDestinationZoneId(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="" disabled>
              Select a zone
            </option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="seats" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Seats
          </label>
          <input
            id="seats"
            type="number"
            min={1}
            max={10}
            required
            value={seatsRequested}
            onChange={(e) => setSeatsRequested(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="paymentMethod" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Payment
          </label>
          <select
            id="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="CASH">Cash</option>
            <option value="TESLAPAY">TeslaPay</option>
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {submitting ? "Requesting..." : "Request ride"}
      </button>
    </form>
  );
}
