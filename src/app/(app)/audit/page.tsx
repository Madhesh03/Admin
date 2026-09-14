"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { listAuditLogs } from "@/lib/admin-api";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABEL,
  type AuditAction,
  type AuditLog,
} from "@/lib/types";
import { useAsync, useDebouncedValue } from "@/lib/use-async";
import { cn, formatDateTime } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";

const PAGE_SIZE = 20;

// The models that AuditService.log writes against, for a quick filter. Free of
// consequence if the list drifts — an unknown value simply matches nothing.
const AUDIT_MODELS = [
  "Product",
  "ProductMedia",
  "Category",
  "Collection",
  "Order",
  "Payment",
  "Refund",
  "Return",
  "Shipment",
  "StockLedger",
  "PurchaseOrder",
  "Supplier",
  "Customer",
  "StaffUser",
];

const ACTION_CLASS: Record<AuditAction, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  status_change: "bg-amber-100 text-amber-700",
  login: "bg-surface text-muted",
  logout: "bg-surface text-muted",
};

export default function AuditPage() {
  return (
    <RequirePermission perm="audit.view_log">
      <AuditInner />
    </RequirePermission>
  );
}

function AuditInner() {
  const [actorEmail, setActorEmail] = React.useState("");
  const [model, setModel] = React.useState("");
  const [action, setAction] = React.useState<AuditAction | "all">("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const debounced = useDebouncedValue(actorEmail);

  // Any change to the query invalidates the current page number.
  React.useEffect(() => {
    setPage(1);
  }, [debounced, model, action, from, to]);

  const { data, loading, error, reload } = useAsync(
    () =>
      listAuditLogs({
        actor_email: debounced || undefined,
        model_name: model || undefined,
        action,
        // date_to is inclusive of the whole day so the picker reads naturally.
        date_from: from || undefined,
        date_to: to ? `${to}T23:59:59` : undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    [debounced, model, action, from, to, page],
  );

  const rows: AuditLog[] = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="An immutable record of who changed what, and when, across the store."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input
            className="pl-9"
            placeholder="Filter by actor email…"
            value={actorEmail}
            onChange={(e) => setActorEmail(e.target.value)}
          />
        </div>
        <NativeSelect
          className="w-auto min-w-[130px]"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          <option value="">All records</option>
          {AUDIT_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-auto min-w-[130px]"
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | "all")}
        >
          <option value="all">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>{AUDIT_ACTION_LABEL[a]}</option>
          ))}
        </NativeSelect>
        <div className="flex items-center gap-1.5">
          <Input type="date" className="w-auto" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="text-xs text-faint">→</span>
          <Input type="date" className="w-auto" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
      </div>

      <Card>
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No audit entries" description="Try adjusting the filters or date range." />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <Th>When</Th>
                  <Th>Action</Th>
                  <Th>Record</Th>
                  <Th>Changes</Th>
                  <Th>Actor</Th>
                  <Th>IP</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((log) => (
                  <React.Fragment key={log.id}>
                    <Tr
                      clickable
                      onClick={() =>
                        setExpanded((cur) => (cur === log.id ? null : log.id))
                      }
                    >
                      <Td className="whitespace-nowrap text-muted">{formatDateTime(log.timestamp)}</Td>
                      <Td>
                        <Badge className={ACTION_CLASS[log.action]}>
                          {log.action_display || AUDIT_ACTION_LABEL[log.action]}
                        </Badge>
                      </Td>
                      <Td>
                        <p className="font-medium text-ink">{log.model_name}</p>
                        <p className="truncate text-xs text-faint" title={log.object_id}>
                          {shortId(log.object_id)}
                        </p>
                      </Td>
                      <Td className="max-w-[280px] truncate text-muted" title={changeSummary(log.changes)}>
                        {changeSummary(log.changes) || "—"}
                      </Td>
                      <Td className={cn(!log.actor_email && "text-faint")}>
                        {log.actor_email || "System"}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{log.ip_address || "—"}</Td>
                    </Tr>
                    {expanded === log.id && (
                      <Tr>
                        <Td colSpan={6} className="bg-surface">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted">
                            {JSON.stringify(log.changes, null, 2)}
                          </pre>
                        </Td>
                      </Tr>
                    )}
                  </React.Fragment>
                ))}
              </TBody>
            </Table>

            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

/** First segment of a UUID — enough to recognise, without the visual noise. */
function shortId(id: string): string {
  return id.includes("-") ? id.split("-")[0] : id.slice(0, 8);
}

/** A one-line preview of the changed fields, e.g. "status: paid → processing". */
function changeSummary(changes: Record<string, unknown>): string {
  const parts = Object.entries(changes).map(([field, value]) => {
    if (value && typeof value === "object" && "from" in value && "to" in value) {
      const v = value as { from: unknown; to: unknown };
      return `${field}: ${String(v.from)} → ${String(v.to)}`;
    }
    return field;
  });
  return parts.join(", ");
}
