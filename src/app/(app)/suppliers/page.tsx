"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import {
  createSupplier,
  listSuppliers,
  updateSupplier,
  type SupplierInput,
} from "@/lib/admin-api";
import { supplierSchema } from "@/lib/schemas";
import type { Supplier } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

export default function SuppliersPage() {
  return (
    <RequirePermission perm="inventory.view_supplier">
      <SuppliersInner />
    </RequirePermission>
  );
}

function SuppliersInner() {
  const { can } = useAuth();
  const [active, setActive] = React.useState<"all" | "true" | "false">("all");
  const { data, loading, error, reload } = useAsync<Supplier[]>(
    () => listSuppliers(active === "all" ? {} : { active: active === "true" }),
    [active],
  );
  const [editing, setEditing] = React.useState<Supplier | "new" | null>(null);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Vendors you raise purchase orders against."
        actions={can("inventory.manage_supplier") && <Button onClick={() => setEditing("new")}><Plus className="size-4" />Add supplier</Button>}
      />
      <div className="mb-4 max-w-[180px]">
        <NativeSelect value={active} onChange={(e) => setActive(e.target.value as typeof active)}>
          <option value="all">All suppliers</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </NativeSelect>
      </div>
      <Card>
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No suppliers" />
        ) : (
          <Table>
            <THead><tr><Th>Supplier</Th><Th>Contact</Th><Th>GSTIN</Th><Th>Status</Th>{can("inventory.manage_supplier") && <Th />}</tr></THead>
            <TBody>
              {data.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="text-xs text-faint">{s.address}</p>
                  </Td>
                  <Td className="text-muted">
                    <p>{s.contact_name || "—"}</p>
                    <p className="text-xs text-faint">{s.email || s.phone}</p>
                  </Td>
                  <Td className="text-faint">{s.gstin || "—"}</Td>
                  <Td><Badge className={s.is_active ? "bg-green-100 text-green-700" : "bg-surface text-muted"}>{s.is_active ? "Active" : "Inactive"}</Badge></Td>
                  {can("inventory.manage_supplier") && <Td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(s)}><Pencil className="size-4" />Edit</Button></Td>}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {editing && (
        <SupplierDialog
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function SupplierDialog({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<SupplierInput>({
    name: supplier?.name ?? "", contact_name: supplier?.contact_name ?? "", phone: supplier?.phone ?? "",
    email: supplier?.email ?? "", address: supplier?.address ?? "", gstin: supplier?.gstin ?? "",
    notes: supplier?.notes ?? "", is_active: supplier?.is_active ?? true,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const parsed = supplierSchema.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      setErrors({ name: fe.name?.[0] ?? "", email: fe.email?.[0] ?? "", gstin: fe.gstin?.[0] ?? "" });
      return;
    }
    setBusy(true);
    try {
      if (supplier) await updateSupplier(supplier.id, parsed.data);
      else await createSupplier(parsed.data);
      toast.success(supplier ? "Supplier updated" : "Supplier created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={supplier ? "Edit supplier" : "New supplier"}>
        <div className="space-y-4">
          <Field label="Name" required error={errors.name}><Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact name"><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email" error={errors.email}><Input value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="GSTIN" error={errors.gstin}><Input value={form.gstin} invalid={!!errors.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></Field>
          </div>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <ToggleField label="Active" checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} onClick={submit}>{supplier ? "Save" : "Create"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
