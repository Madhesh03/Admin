"use client";

import * as React from "react";
import { createSupplier, updateSupplier, type SupplierInput } from "@/lib/admin-api";
import { supplierSchema } from "@/lib/schemas";
import type { Supplier } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/**
 * Create/edit a supplier. Shared by the Suppliers page and anywhere else a
 * supplier is needed inline (e.g. the new-PO form, which would otherwise dead-end
 * with "no active suppliers" and no way out short of leaving the page).
 * `onSaved` receives the created/updated supplier so a caller that cares which
 * one it was (auto-selecting it, say) doesn't have to re-fetch the list to find it.
 */
export function SupplierDialog({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}) {
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
      const saved = supplier
        ? await updateSupplier(supplier.id, parsed.data)
        : await createSupplier(parsed.data);
      toast.success(supplier ? "Supplier updated" : "Supplier created");
      onSaved(saved);
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
