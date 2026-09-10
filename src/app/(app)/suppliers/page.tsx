"use client";

import * as React from "react";
import { Plus, Pencil } from "lucide-react";
import { listSuppliers } from "@/lib/admin-api";
import type { Supplier } from "@/lib/types";
import { useAsync, usePagination } from "@/lib/use-async";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/states";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { SupplierDialog } from "@/components/suppliers/supplier-dialog";

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
  const { page, setPage, pageRows, total } = usePagination(data ?? [], 20);
  React.useEffect(() => {
    setPage(1);
  }, [active, setPage]);

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
          <>
          <Table>
            <THead><tr><Th>Supplier</Th><Th>Contact</Th><Th>GSTIN</Th><Th>Status</Th>{can("inventory.manage_supplier") && <Th />}</tr></THead>
            <TBody>
              {pageRows.map((s) => (
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
          <Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />
          </>
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
