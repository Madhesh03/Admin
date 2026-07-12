"use client";

import * as React from "react";
import { Plus, Pencil, ShieldCheck } from "lucide-react";
import {
  createStaff,
  listRoles,
  listStaff,
  updateStaffRole,
  type StaffCreateInput,
} from "@/lib/admin-api";
import { staffSchema } from "@/lib/schemas";
import type { Role, StaffUser } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDate } from "@/lib/utils";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

export default function StaffPage() {
  return (
    <RequirePermission perm="accounts.manage_staff">
      <Inner />
    </RequirePermission>
  );
}

function Inner() {
  const staff = useAsync<StaffUser[]>(() => listStaff(), []);
  const roles = useAsync<Role[]>(() => listRoles(), []);
  const [dialog, setDialog] = React.useState<{ mode: "new" } | { mode: "role"; user: StaffUser } | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & Roles"
        description="Manage back-office users and review what each role can do."
        actions={<Button onClick={() => setDialog({ mode: "new" })}><Plus className="size-4" />Add staff</Button>}
      />

      <Card>
        <CardHeader><CardTitle>Staff users</CardTitle></CardHeader>
        {staff.loading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : staff.error ? (
          <ErrorState message={staff.error} onRetry={staff.reload} />
        ) : !staff.data || staff.data.length === 0 ? (
          <EmptyState title="No staff users" />
        ) : (
          <Table>
            <THead><tr><Th>User</Th><Th>Role</Th><Th>Status</Th><Th>Since</Th><Th /></tr></THead>
            <TBody>
              {staff.data.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <p className="font-semibold text-ink">{u.first_name} {u.last_name}</p>
                    <p className="text-xs text-faint">{u.email}</p>
                  </Td>
                  <Td><Badge className="bg-sage capitalize text-forest">{u.role.name.replace(/_/g, " ")}</Badge></Td>
                  <Td><Badge className={u.is_active ? "bg-green-100 text-green-700" : "bg-surface text-muted"}>{u.is_active ? "Active" : "Inactive"}</Badge></Td>
                  <Td className="text-muted">{formatDate(u.created_at)}</Td>
                  <Td className="text-right"><Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "role", user: u })}><Pencil className="size-4" />Role</Button></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><ShieldCheck className="size-4 text-forest" />Roles & permissions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(roles.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="capitalize">{r.name.replace(/_/g, " ")}</CardTitle>
                {r.is_system_role && <Badge className="bg-surface text-muted">System</Badge>}
              </CardHeader>
              <CardBody>
                <div className="flex flex-wrap gap-1.5">
                  {r.permissions.map((p) => (
                    <span key={p.codename} title={p.description} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {p.codename}
                    </span>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>

      {dialog?.mode === "new" && (
        <NewStaffDialog roles={roles.data ?? []} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); staff.reload(); }} />
      )}
      {dialog?.mode === "role" && (
        <RoleDialog user={dialog.user} roles={roles.data ?? []} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); staff.reload(); }} />
      )}
    </div>
  );
}

function NewStaffDialog({ roles, onClose, onSaved }: { roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<StaffCreateInput>({ email: "", password: "", first_name: "", last_name: "", role_id: roles[0]?.id ?? "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    const parsed = staffSchema.safeParse(form);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      setErrors({ email: fe.email?.[0] ?? "", password: fe.password?.[0] ?? "", role_id: fe.role_id?.[0] ?? "" });
      return;
    }
    setBusy(true);
    try {
      await createStaff(parsed.data);
      toast.success("Staff user created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Add staff user">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First name"><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Last name"><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
          </div>
          <Field label="Email" required error={errors.email}><Input type="email" value={form.email} invalid={!!errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" required error={errors.password} hint="Min 8 characters"><Input type="password" value={form.password} invalid={!!errors.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role" required error={errors.role_id}>
            <NativeSelect value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id} className="capitalize">{r.name.replace(/_/g, " ")}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={submit}>Create</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ user, roles, onClose, onSaved }: { user: StaffUser; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [roleId, setRoleId] = React.useState(user.role.id);
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    setBusy(true);
    try { await updateStaffRole(user.id, roleId); toast.success("Role updated"); onSaved(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not update"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Change role — ${user.first_name} ${user.last_name}`}>
        <div className="space-y-4">
          <Field label="Role">
            <NativeSelect value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id} className="capitalize">{r.name.replace(/_/g, " ")}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={submit}>Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
