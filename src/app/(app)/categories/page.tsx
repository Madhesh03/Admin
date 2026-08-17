"use client";

import * as React from "react";
import { Plus, Pencil, Upload } from "lucide-react";
import {
  createCategory,
  listCategories,
  updateCategory,
  type CategoryInput,
} from "@/lib/admin-api";
import { categorySchema } from "@/lib/schemas";
import type { Category } from "@/lib/types";
import { uploadCategoryImage } from "@/lib/media-upload";
import { preferStableSrc } from "@/lib/utils";
import { useAsync } from "@/lib/use-async";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ToggleField } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

export default function CategoriesPage() {
  return (
    <RequirePermission perm="catalog.view_product">
      <CategoriesInner />
    </RequirePermission>
  );
}

function CategoriesInner() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useAsync<Category[]>(() => listCategories(), []);
  const [editing, setEditing] = React.useState<Category | "new" | null>(null);

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organise your catalogue. Product counts are derived on the storefront."
        actions={can("catalog.add_product") && <Button onClick={() => setEditing("new")}><Plus className="size-4" />Add category</Button>}
      />
      <Card>
        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No categories yet" />
        ) : (
          <Table>
            <THead><tr><Th className="w-[45%]">Category</Th><Th>Slug</Th><Th>Status</Th><Th className="text-right">Order</Th>{can("catalog.edit_product") && <Th />}</tr></THead>
            <TBody>
              {data.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Thumb src={preferStableSrc(c.image_key, c.image_url)} alt={c.name} className="size-10 shrink-0" />
                      <div>
                        <p className="font-semibold text-ink">{c.name}</p>
                        <p className="truncate text-xs text-faint">{c.description}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-faint">{c.slug}</Td>
                  <Td><Badge className={c.is_active ? "bg-green-100 text-green-700" : "bg-surface text-muted"}>{c.is_active ? "Active" : "Inactive"}</Badge></Td>
                  <Td className="text-right text-muted">{c.sort_order}</Td>
                  {can("catalog.edit_product") && (
                    <Td className="text-right"><Button variant="ghost" size="sm" onClick={() => setEditing(c)}><Pencil className="size-4" />Edit</Button></Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {editing && (
        <CategoryDialog
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function CategoryDialog({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<CategoryInput>({
    name: category?.name ?? "",
    description: category?.description ?? "",
    image_key: category?.image_key ?? "",
    is_active: category?.is_active ?? true,
    sort_order: category?.sort_order ?? 0,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  // A file chosen but not yet uploaded — held locally with an object-URL preview
  // and only uploaded when the category is created/saved.
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Revoke the preview object URL when it's replaced or the dialog unmounts.
  const previewRef = React.useRef<string | null>(null);
  previewRef.current = preview;
  React.useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  function clearPending() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPendingFile(null);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    // Hold the file locally; upload happens on submit.
    if (preview) URL.revokeObjectURL(preview);
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
    setForm((f) => ({ ...f, image_key: "" })); // a picked file supersedes any pasted URL
  }

  async function submit() {
    const parsed = categorySchema.safeParse(form);
    if (!parsed.success) {
      setErrors({ name: parsed.error.flatten().fieldErrors.name?.[0] ?? "" });
      return;
    }
    setBusy(true);
    try {
      let data = parsed.data;
      if (pendingFile) {
        // presign → PUT bytes to S3 → confirm; returns the key to store in image_key.
        const image_key = await uploadCategoryImage({
          blob: pendingFile,
          fileName: pendingFile.name,
          mime: pendingFile.type,
        });
        data = { ...data, image_key };
      }
      if (category) await updateCategory(category.id, data);
      else await createCategory(data);
      clearPending();
      toast.success(category ? "Category updated" : "Category created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  // Thumbnail source: a pending file's local preview wins; otherwise show the
  // stored image via its presigned view URL (bare keys don't resolve on a
  // private bucket), but a freshly pasted URL is shown directly as typed.
  const previewSrc = preview
    ? preview
    : form.image_key && form.image_key === category?.image_key
      ? preferStableSrc(form.image_key, category?.image_url)
      : form.image_key;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={category ? "Edit category" : "New category"}>
        <div className="space-y-4">
          <Field label="Name" required error={errors.name}><Input value={form.name} invalid={!!errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Thumbnail" hint="Upload an image or paste an image URL — uploaded on save">
            <div className="flex items-start gap-3">
              <Thumb src={previewSrc} alt={form.name || "Category"} className="size-16 shrink-0" />
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="https://…"
                  // Show only a genuine pasted URL; a picked file or stored key stays
                  // hidden here but still renders in the thumbnail preview.
                  value={preview ? "" : (/^https?:\/\//i.test(form.image_key ?? "") ? form.image_key : "")}
                  onChange={(e) => { clearPending(); setForm({ ...form, image_key: e.target.value }); }}
                />
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="size-4" />{pendingFile ? "Change image" : "Upload image"}
                  </Button>
                  {(pendingFile || form.image_key) && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { clearPending(); setForm({ ...form, image_key: "" }); }}>Remove</Button>
                  )}
                </div>
                {pendingFile && <p className="text-xs text-muted">{pendingFile.name} — uploads when you {category ? "save" : "create"}.</p>}
              </div>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sort order"><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></Field>
          </div>
          <ToggleField label="Active" checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} onClick={submit}>{category ? "Save" : "Create"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
