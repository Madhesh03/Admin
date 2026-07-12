"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Package,
  AlertTriangle,
  ClipboardList,
  IndianRupee,
  Undo2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { getStats } from "@/lib/admin-api";
import { orderCustomerName } from "@/lib/derive";
import { ORDER_STATUSES, titleCase, type DashboardStats } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { cn, formatDate, formatPrice } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { NAV_GROUPS } from "@/components/layout/nav";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export default function DashboardPage() {
  const router = useRouter();
  const { staff, can } = useAuth();
  const hasStats = can("orders.view_order");
  const { data, loading, error, reload } = useAsync<DashboardStats>(
    () => (hasStats ? getStats() : Promise.resolve(null as unknown as DashboardStats)),
    [hasStats],
  );

  // Roles without order access (e.g. inventory_staff) get a quick-links landing.
  if (!hasStats) {
    const links = NAV_GROUPS.flatMap((g) => g.items).filter(
      (i) => i.href !== "/" && (!i.perm || can(i.perm)),
    );
    return (
      <div>
        <PageHeader
          title={`Welcome back${staff ? `, ${staff.first_name}` : ""}`}
          description="Jump into the areas your role can access."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((i) => (
            <Link key={i.href} href={i.href} className="group">
              <Card className="transition-colors group-hover:border-line-strong">
                <CardBody className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-sage text-forest"><i.icon className="size-5" /></span>
                  <p className="font-semibold text-ink">{i.label}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Welcome back${staff ? `, ${staff.first_name}` : ""}`}
        description="Here's what's happening across your store today."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardBody className="space-y-3"><Skeleton className="h-9 w-9 rounded-lg" /><Skeleton className="h-7 w-20" /><Skeleton className="h-4 w-24" /></CardBody></Card>
          ))
        ) : error || !data ? (
          <Card className="sm:col-span-2 xl:col-span-4"><ErrorState message={error ?? undefined} onRetry={reload} /></Card>
        ) : (
          <>
            <StatCard icon={Package} tone="forest" label="Active products" value={String(data.product_count)} href="/products" />
            <StatCard icon={AlertTriangle} tone="amber" label="Low / out of stock" value={String(data.low_stock_count)} href="/stock" />
            <StatCard icon={ClipboardList} tone="blue" label="Orders needing action" value={String(data.orders_needing_action)} href="/orders" />
            <StatCard icon={IndianRupee} tone="green" label="Revenue" value={formatPrice(data.revenue)} href="/orders" />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent orders</CardTitle>
              <Link href="/orders" className="text-sm font-semibold text-forest hover:underline">View all</Link>
            </CardHeader>
            {loading ? (
              <CardBody className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardBody>
            ) : !data || data.recent_orders.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <Table>
                <THead><tr><Th>Order</Th><Th>Customer</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></THead>
                <TBody>
                  {data.recent_orders.map((o) => (
                    <Tr key={o.id} clickable onClick={() => router.push(`/orders/${o.id}`)}>
                      <Td className="font-semibold text-ink">{o.order_number}</Td>
                      <Td>
                        <p className="font-medium text-ink">{orderCustomerName(o)}</p>
                        <p className="text-xs text-faint">{formatDate(o.created_at)}</p>
                      </Td>
                      <Td className="text-right font-semibold">{formatPrice(o.total_amount)}</Td>
                      <Td><OrderStatusBadge status={o.status} /></Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Orders by status</CardTitle></CardHeader>
            <CardBody className="space-y-2.5">
              {loading || !data ? (
                Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
              ) : (
                ORDER_STATUSES.map((s) => (
                  <div key={s} className="flex items-center justify-between">
                    <OrderStatusBadge status={s} />
                    <span className="text-sm font-bold text-ink">{data.orders_by_status[s] ?? 0}</span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          {!loading && data && data.pending_returns > 0 && (
            <Link href="/returns">
              <Card className="transition-colors hover:border-line-strong">
                <CardBody className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700"><Undo2 className="size-5" /></span>
                  <div>
                    <p className="text-2xl font-bold text-ink">{data.pending_returns}</p>
                    <p className="text-sm text-muted">Returns need attention</p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  forest: "bg-sage text-forest",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
};

function StatCard({ icon: Icon, tone, label, value, href }: { icon: LucideIcon; tone: string; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="group">
      <Card className="transition-colors group-hover:border-line-strong">
        <CardBody>
          <div className="flex items-start justify-between">
            <span className={cn("flex size-10 items-center justify-center rounded-lg", TONE[tone] ?? TONE.forest)}><Icon className="size-5" /></span>
            <ArrowRight className="size-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-3 text-2xl font-bold text-ink">{value}</p>
          <p className="text-sm text-muted">{label}</p>
        </CardBody>
      </Card>
    </Link>
  );
}
