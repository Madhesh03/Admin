"use client";

import { listRefunds } from "@/lib/admin-api";
import { titleCase, type Refund } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDateTime, formatPrice } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

const STATUS_CLASS: Record<Refund["status"], string> = {
  initiated: "bg-amber-100 text-amber-700",
  processed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function RefundsPage() {
  return (
    <RequirePermission perm="orders.view_order">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const { data, loading, error, reload } = useAsync<Refund[]>(() => listRefunds(), []);

  return (
    <div>
      <PageHeader title="Refunds" description="Razorpay refunds issued against orders." />
      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No refunds yet" description="Refunds appear here once issued from an order." />
        ) : (
          <Table>
            <THead><tr><Th>Refund</Th><Th>Reason</Th><Th>When</Th><Th className="text-right">Amount</Th><Th>Status</Th></tr></THead>
            <TBody>
              {data.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-mono text-xs text-ink">{r.razorpay_refund_id}</Td>
                  <Td className="text-muted">{r.reason || "—"}</Td>
                  <Td className="text-muted">{formatDateTime(r.created_at)}</Td>
                  <Td className="text-right font-semibold">{formatPrice(r.amount)}</Td>
                  <Td><Badge className={STATUS_CLASS[r.status]}>{titleCase(r.status)}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
