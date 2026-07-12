"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { UserX, MapPin, Mail, Phone } from "lucide-react";
import { getCustomer } from "@/lib/admin-api";
import type { Customer, Order } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDate, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

type Data = { customer: Customer; orders: Order[] };

export default function CustomerDetailPage() {
  const { email } = useParams<{ email: string }>();
  const decoded = decodeURIComponent(email);
  const { data, loading, error, reload } = useAsync<Data | null>(() => getCustomer(decoded), [decoded]);

  return (
    <RequirePermission perm="orders.view_order">
      <PageHeader title={data ? data.customer.name : "Customer"} description={data?.customer.email} backHref="/customers" />
      {loading ? (
        <Card><LoadingState label="Loading customer…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data ? (
        <Card><EmptyState icon={UserX} title="Customer not found" description="No orders match this email." /></Card>
      ) : (
        <Detail data={data} />
      )}
    </RequirePermission>
  );
}

function Detail({ data }: { data: Data }) {
  const { customer, orders } = data;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Row icon={Mail} value={customer.email} />
            {customer.phone && <Row icon={Phone} value={customer.phone} />}
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
              <Stat label="Orders" value={String(customer.order_count)} />
              <Stat label="Total spent" value={formatPrice(customer.total_spent)} />
            </div>
            <p className="text-xs text-faint">Customer since {formatDate(customer.first_order_date)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Saved addresses</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {customer.addresses.map((a, i) => (
              <div key={i} className="flex gap-2.5 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-faint" />
                <div className="text-muted">
                  <p className="font-medium text-ink">{a.full_name}</p>
                  <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
                  <p>{a.city}, {a.state} — {a.pincode}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Order history</CardTitle>
            <span className="text-sm text-faint">{orders.length} orders</span>
          </CardHeader>
          <Table>
            <THead><tr><Th>Order</Th><Th>Date</Th><Th className="text-center">Items</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></THead>
            <TBody>
              {orders.map((o) => (
                <Tr key={o.id} clickable>
                  <Td className="font-semibold"><Link href={`/orders/${o.id}`} className="text-ink hover:text-forest">{o.order_number}</Link></Td>
                  <Td className="text-muted">{formatDate(o.created_at)}</Td>
                  <Td className="text-center text-muted">{o.items.reduce((s, it) => s + it.quantity, 0)}</Td>
                  <Td className="text-right font-semibold">{formatPrice(o.total_amount)}</Td>
                  <Td><OrderStatusBadge status={o.status} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon: Icon, value }: { icon: React.ComponentType<{ className?: string }>; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-muted">
      <Icon className="size-4 shrink-0 text-faint" />
      <span className="truncate text-ink">{value}</span>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
