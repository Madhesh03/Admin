"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, Menu, Building2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ALL_NAV_ITEMS, NAV_GROUPS } from "./nav";
import { PendingOrdersBadge } from "./pending-orders-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase() || "SA";
}

export function Topbar() {
  const { staff, tenantId, logout, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const current = [...ALL_NAV_ITEMS]
    .filter((i) => i.match(pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];

  async function handleLogout() {
    await logout();
    toast.info("Signed out");
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/90 px-5 backdrop-blur">
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] overflow-y-auto">
            {NAV_GROUPS.flatMap((g) => g.items)
              .filter((i) => !i.perm || can(i.perm))
              .map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>
                    <item.icon />
                    {item.label}
                    {item.showPendingOrders && <PendingOrdersBadge />}
                  </Link>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <h1 className="text-lg font-bold text-ink">{current?.label ?? "SOIS Admin"}</h1>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted sm:flex">
          <Building2 className="size-3.5" />
          {tenantId}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface">
              <span className="flex size-8 items-center justify-center rounded-full bg-forest text-xs font-bold text-white">
                {staff ? initials(staff.first_name, staff.last_name) : "SA"}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight text-ink">
                  {staff ? `${staff.first_name} ${staff.last_name}` : "Admin"}
                </span>
                <span className="block text-[11px] capitalize leading-tight text-faint">
                  {staff?.role.name.replace(/_/g, " ")}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="px-2.5 py-1.5 text-xs text-faint">{staff?.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={handleLogout}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
