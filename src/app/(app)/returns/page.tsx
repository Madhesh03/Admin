"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RETURN_REASON_LABEL, RETURN_STATUSES, titleCase, type Return, type ReturnStatus } from "@/lib/types";
import { listReturns } from "@/lib/admin-api";
import { useAsync } from "@/lib/use-async";
import { formatDate } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { ReturnStatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

export default function ReturnsPage() {
  return (
    <RequirePermission perm="orders.view_order">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const router = useRouter();
  const [status, setStatus] = React.useState<ReturnStatus | "all">("all");
  const { data, loading, error, reload } = useAsync(
    () => listReturns(status === "all" ? {} : { status }),
    [status],
  );
  const rows: Return[] = data?.items ?? [];

  return (
    <div>
      <PageHeader title="Returns" description="Manage the return/RMA workflow — approve, inspect, and refund." />
      <div className="mb-4 max-w-[200px]">
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as ReturnStatus | "all")}>
          <option value="all">All statuses</option>
          {RETURN_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
        </NativeSelect>
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No returns" />
        ) : (
          <Table>
            <THead><tr><Th>Order</Th><Th>Reason</Th><Th>Requested</Th><Th>Status</Th></tr></THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.id} clickable onClick={() => router.push(`/returns/${r.id}`)}>
                  <Td className="font-semibold text-ink">{r.order_number}</Td>
                  <Td className="text-muted">{RETURN_REASON_LABEL[r.reason]}</Td>
                  <Td className="text-muted">{formatDate(r.created_at)}</Td>
                  <Td><ReturnStatusBadge status={r.status} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
