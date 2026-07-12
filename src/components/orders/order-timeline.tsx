import { Check } from "lucide-react";
import { orderSteps } from "@/lib/derive";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Progress timeline derived from the order's current status (§ derive.orderSteps). */
export function OrderTimeline({ status }: { status: OrderStatus }) {
  const steps = orderSteps(status);
  const terminal = status === "cancelled" || status === "refunded";
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const danger = terminal && isLast;
        return (
          <li key={s.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                  danger
                    ? "border-red-500 bg-red-500 text-white"
                    : s.done
                      ? "border-forest bg-forest text-white"
                      : "border-line-strong bg-white text-transparent",
                )}
              >
                <Check className="size-4" />
              </span>
              {!isLast && (
                <span className={cn("w-0.5 flex-1", s.done && !danger ? "bg-forest" : "bg-line")} />
              )}
            </div>
            <div className={cn("pb-6", isLast && "pb-0")}>
              <p className={cn("text-sm font-semibold", s.done || danger ? "text-ink" : "text-faint")}>
                {s.label}
              </p>
              {s.current && <p className="text-xs text-forest">Current</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
