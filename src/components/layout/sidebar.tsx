"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gem } from "lucide-react";
import { NAV_GROUPS } from "./nav";
import { PendingOrdersBadge } from "./pending-orders-badge";
import { ResetDemoButton } from "./reset-demo-button";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { can } = useAuth();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-forest text-white">
          <Gem className="size-5" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-extrabold tracking-tight text-ink">SOIS</p>
          <p className="text-[11px] font-medium text-faint">Admin Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group, gi) => {
          const items = group.items.filter((i) => !i.perm || can(i.perm));
          if (items.length === 0) return null;
          return (
            <div key={gi}>
              {group.label && (
                <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                        active
                          ? "bg-sage text-forest"
                          : "text-muted hover:bg-surface hover:text-ink",
                      )}
                    >
                      <Icon className="size-[18px]" />
                      {item.label}
                      {item.showPendingOrders && <PendingOrdersBadge />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <ResetDemoButton />
      </div>
    </aside>
  );
}
