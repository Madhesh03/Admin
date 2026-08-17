"use client";

import * as React from "react";
import { Boxes, Ruler, Save } from "lucide-react";
import { adjustStock } from "@/lib/admin-api";
import { stockLevel } from "@/lib/derive";
import type { ProductDetail } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StockBadge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/utils";

/**
 * Per-size stock manager for sized products (rings, bangles).
 *
 * Each size carries its own stock level. Edits route through the audited
 * `/inventory/stock/adjust/` endpoint (one call per changed size, tagged with
 * `size`) — never a direct write — so every change lands in the stock ledger,
 * exactly like the whole-product adjustment on the Stock page.
 */
export function ProductSizeStock({
  product,
  onChanged,
}: {
  product: ProductDetail;
  onChanged?: () => void;
}) {
  const { can } = useAuth();
  const canAdjust = can("inventory.adjust_stock");
  const rows = product.size_stock;
  const axisLabel = product.variant_label?.trim() || "Size";

  // Draft qty per size, seeded from the current levels. Re-seeds when the
  // product reloads (e.g. after a successful save) so inputs reflect reality.
  const seed = React.useCallback(
    () => Object.fromEntries(rows.map((r) => [r.size, String(r.qty)])),
    [rows],
  );
  const [draft, setDraft] = React.useState<Record<string, string>>(seed);
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<{ note?: string; qty?: string }>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setDraft(seed());
    setNote("");
    setErrors({});
  }, [seed]);

  const total = rows.reduce((sum, r) => sum + r.qty, 0);
  const changed = rows.filter((r) => {
    const raw = draft[r.size];
    return raw !== undefined && raw.trim() !== "" && Number(raw) !== r.qty;
  });
  const dirty = changed.length > 0;

  async function save() {
    // Guard the inputs before touching the ledger.
    const invalid = changed.find((r) => {
      const n = Number(draft[r.size]);
      return !Number.isInteger(n) || n < 0;
    });
    if (invalid) {
      setErrors({ qty: "Whole units, 0 or more" });
      return;
    }
    if (!note.trim()) {
      setErrors({ note: "A note is required" });
      return;
    }
    setErrors({});
    setBusy(true);
    let failed = 0;
    for (const r of changed) {
      try {
        await adjustStock(product.id, Number(draft[r.size]), note.trim(), r.size);
      } catch {
        failed++;
      }
    }
    setBusy(false);
    if (failed) {
      toast.error(`${failed} of ${changed.length} size${changed.length > 1 ? "s" : ""} failed to update`);
    } else {
      toast.success(`Updated ${changed.length} size${changed.length > 1 ? "s" : ""}`);
    }
    onChanged?.();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{axisLabel} stock</CardTitle>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <Boxes className="size-4" />
          {total} total{product.size_unit ? ` · ${product.size_unit}` : ""}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        {rows.length === 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-dashed border-line-strong p-3 text-sm text-muted">
            <Ruler className="mt-0.5 size-4 shrink-0" />
            This product has no variations. Add them under{" "}
            <strong>Variations</strong> above to track stock per variant.
          </p>
        ) : (
          <>
            <div className="divide-y divide-line rounded-lg border border-line">
              {rows.map((r) => (
                <div key={r.size} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-28 shrink-0">
                    <p className="font-semibold text-ink">
                      {r.size}
                      {!r.is_active && <span className="ml-1.5 text-xs font-normal text-faint">(inactive)</span>}
                    </p>
                    <p className="truncate text-xs text-faint">
                      {r.sku || "—"} · {formatPrice(r.effective_price)}
                      {r.net_weight != null ? ` · ${r.net_weight}g` : ""}
                    </p>
                  </div>
                  <StockBadge level={stockLevel(r.qty)} />
                  <div className="flex-1" />
                  {canAdjust ? (
                    <label className="flex items-center gap-2 text-sm text-muted">
                      Qty
                      <Input
                        inputMode="numeric"
                        className="w-20"
                        value={draft[r.size] ?? ""}
                        invalid={!!errors.qty && Number(draft[r.size]) !== r.qty}
                        onChange={(e) => setDraft((d) => ({ ...d, [r.size]: e.target.value }))}
                      />
                    </label>
                  ) : (
                    <span className="text-sm font-semibold text-ink">{r.qty}</span>
                  )}
                </div>
              ))}
            </div>

            {canAdjust && (
              <>
                <Field
                  label="Reason / note"
                  htmlFor="size-stock-note"
                  error={errors.note}
                  hint="Recorded in the stock ledger for each changed size"
                >
                  <Input
                    id="size-stock-note"
                    value={note}
                    invalid={!!errors.note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Recount after audit"
                  />
                </Field>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-faint">
                    {dirty
                      ? `${changed.length} size${changed.length > 1 ? "s" : ""} pending`
                      : "No changes"}
                  </p>
                  <Button type="button" size="sm" loading={busy} disabled={!dirty} onClick={save}>
                    <Save className="size-4" />
                    Save stock
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
