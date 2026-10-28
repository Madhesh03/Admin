"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { listCustomers, type CustomerSort } from "@/lib/admin-api";
import type { Customer } from "@/lib/types";
import { formatDate, toCsv, downloadFile } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input, NativeSelect, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** Columns offered for export — label matches the on-screen table header. */
const FIELDS = [
  { key: "name", label: "Name", value: (c: Customer) => c.name },
  { key: "email", label: "Email", value: (c: Customer) => c.email },
  { key: "phone", label: "Phone", value: (c: Customer) => c.phone },
  { key: "order_count", label: "Orders", value: (c: Customer) => c.order_count },
  { key: "total_spent", label: "Total spent", value: (c: Customer) => c.total_spent },
  { key: "created_at", label: "Joined", value: (c: Customer) => formatDate(c.created_at) },
  { key: "last_order_date", label: "Last order", value: (c: Customer) => formatDate(c.last_order_date) },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const EXPORT_PAGE_SIZE = 100;
const MAX_PAGES = 500; // safety ceiling (~50k customers)

type ExportFilters = {
  search?: string;
  has_orders?: "" | "true" | "false";
  created_from?: string;
  created_to?: string;
  sort?: CustomerSort;
};

/**
 * Fetch every customer matching the filters.
 *
 * Fast path: one unpaginated call (page_size=0). If the server returned the
 * full set (items >= total) we're done in a single request. If it came back
 * short — an older backend that still caps page_size — fall back to paging
 * through the list so we never silently export a truncated result.
 */
async function fetchAllCustomers(params: ExportFilters): Promise<Customer[]> {
  const res = await listCustomers({ ...params, page_size: 0 });
  if (res.items.length >= res.meta.total) return res.items;

  const all: Customer[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const p = await listCustomers({ ...params, page, page_size: EXPORT_PAGE_SIZE });
    all.push(...p.items);
    if (all.length >= p.meta.total || p.items.length === 0) break;
  }
  return all;
}

export function ExportCustomersDialog({
  search,
  hasOrders,
  sort,
}: {
  search: string;
  hasOrders: "" | "true" | "false";
  sort: CustomerSort;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [scope, setScope] = React.useState<"" | "true" | "false">(hasOrders);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [selected, setSelected] = React.useState<Record<FieldKey, boolean>>(
    () => Object.fromEntries(FIELDS.map((f) => [f.key, true])) as Record<FieldKey, boolean>,
  );

  // Reset the scope to the current list filter each time the dialog opens.
  React.useEffect(() => {
    if (open) setScope(hasOrders);
  }, [open, hasOrders]);

  const columns = FIELDS.filter((f) => selected[f.key]);

  async function handleExport() {
    if (columns.length === 0) {
      toast.error("Select at least one field to export.");
      return;
    }
    setBusy(true);
    try {
      const rows = await fetchAllCustomers({
        search,
        has_orders: scope,
        created_from: from || undefined,
        created_to: to || undefined,
        sort,
      });

      if (rows.length === 0) {
        toast.error("No customers match these filters.");
        return;
      }

      const csv = toCsv(
        columns.map((f) => f.label),
        rows.map((c) => columns.map((f) => f.value(c))),
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(csv, `customers-${stamp}.csv`);
      toast.success(`Exported ${rows.length} customer${rows.length === 1 ? "" : "s"}.`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Download /> Export CSV
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Export customers"
        description="Downloads every customer matching the filters below — not just the current page."
      >
        <div className="space-y-5">
          <div>
            <Label>Registered</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-sm text-faint">to</span>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
            <p className="mt-1 text-xs text-faint">Leave blank for no date limit.</p>
          </div>

          <div>
            <Label>Order activity</Label>
            <NativeSelect className="mt-1.5" value={scope} onChange={(e) => setScope(e.target.value as "" | "true" | "false")}>
              <option value="">All customers</option>
              <option value="true">With orders</option>
              <option value="false">Registered without any order</option>
            </NativeSelect>
          </div>

          <div>
            <Label>Fields to include</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-line-strong text-forest focus:ring-forest/30"
                    checked={selected[f.key]}
                    onChange={(e) => setSelected((s) => ({ ...s, [f.key]: e.target.checked }))}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleExport} loading={busy} disabled={columns.length === 0}>
            {busy ? "Preparing…" : "Download CSV"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
