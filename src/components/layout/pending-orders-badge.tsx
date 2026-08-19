"use client";

import * as React from "react";
import { getStats } from "@/lib/admin-api";

/** How often to re-check for work waiting on staff. */
const POLL_MS = 60_000;

/**
 * Count of orders waiting on someone: pending, paid, or being packed.
 *
 * Orders arrive while nobody is looking at the orders screen, and nothing in
 * the app said so — you had to go and check. This polls quietly in the
 * background so a new order announces itself from wherever you are.
 *
 * Silent by design: a failed poll leaves the last known count rather than
 * throwing a toast at someone in the middle of another task.
 */
export function PendingOrdersBadge() {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const stats = await getStats();
        if (active) setCount(stats.orders_needing_action);
      } catch {
        // Leave the previous count in place.
      }
      if (active) timer = setTimeout(poll, POLL_MS);
    }
    void poll();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (!count) return null;
  return (
    <span
      className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-forest px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
      title={`${count} order${count === 1 ? "" : "s"} awaiting action`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
