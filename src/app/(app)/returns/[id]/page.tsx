"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PackageX, Check, X, RefreshCw, PackageCheck, SearchCheck } from "lucide-react";
import {
  approveReturn,
  getReturn,
  inspectReturn,
  receiveReturn,
  rejectReturn,
  retryReturnPickup,
} from "@/lib/admin-api";
import { rejectReturnSchema } from "@/lib/schemas";
import { RETURN_REASON_LABEL, titleCase, type Return } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { formatDateTime } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { RequirePermission } from "@/components/permission-gate";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ReturnStatusBadge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ToggleField } from "@/components/ui/switch";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload, setData } = useAsync<Return | null>(() => getReturn(id), [id]);

  return (
    <RequirePermission perm="orders.view_order">
      <PageHeader
        title={data ? `Return · ${data.order_number}` : "Return"}
        backHref="/returns"
        actions={data ? <ReturnStatusBadge status={data.status} /> : undefined}
      />
      {loading ? (
        <Card><LoadingState label="Loading return…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data ? (
        <Card><EmptyState icon={PackageX} title="Return not found" /></Card>
      ) : (
        <Detail ret={data} onChange={setData} />
      )}
    </RequirePermission>
  );
}

function Detail({ ret, onChange }: { ret: Return; onChange: (r: Return) => void }) {
  const { can } = useAuth();
  const manage = can("orders.update_order_status");
  const [busy, setBusy] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [inspectOpen, setInspectOpen] = React.useState(false);

  async function run(fn: () => Promise<Return>, ok: string) {
    setBusy(true);
    try { onChange(await fn()); toast.success(ok); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Action failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Request</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Row label="Order"><Link href={`/orders`} className="font-semibold text-forest hover:underline">{ret.order_number}</Link></Row>
            <Row label="Reason"><span className="text-ink">{RETURN_REASON_LABEL[ret.reason]}</span></Row>
            {ret.customer_note && <div className="border-t border-line pt-3"><p className="text-xs font-semibold text-faint">Customer note</p><p className="text-ink">{ret.customer_note}</p></div>}
            {ret.staff_note && <div><p className="text-xs font-semibold text-faint">Staff note</p><p className="text-ink">{ret.staff_note}</p></div>}
            {ret.rejection_reason && <div><p className="text-xs font-semibold text-red-600">Rejection reason</p><p className="text-ink">{ret.rejection_reason}</p></div>}
          </CardBody>
        </Card>

        {(ret.return_shipment_awb || ret.inspection_note) && (
          <Card>
            <CardHeader><CardTitle>Reverse logistics</CardTitle></CardHeader>
            <CardBody className="space-y-2 text-sm">
              {ret.return_shipment_awb && <Row label="AWB"><span className="text-ink">{ret.return_shipment_awb}</span></Row>}
              {ret.return_shipment_courier && <Row label="Courier"><span className="capitalize text-ink">{ret.return_shipment_courier}</span></Row>}
              {ret.return_tracking_url && <Row label="Tracking"><a href={ret.return_tracking_url} target="_blank" rel="noreferrer" className="text-forest hover:underline">Open</a></Row>}
              {ret.inspection_note && <div className="border-t border-line pt-2"><p className="text-xs font-semibold text-faint">Inspection</p><p className="text-ink">{ret.inspection_note}</p><p className="text-xs text-faint">{formatDateTime(ret.inspected_at)}</p></div>}
              {ret.refund_id && <Row label="Refund"><Link href="/refunds" className="text-forest hover:underline">View refunds</Link></Row>}
            </CardBody>
          </Card>
        )}

        {ret.media.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Customer media</CardTitle></CardHeader>
            <CardBody className="text-sm text-muted">{ret.media.length} file(s) submitted for inspection.</CardBody>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Workflow</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {!manage && <p className="text-sm text-faint">View-only — you can’t action returns.</p>}
            {manage && ret.status === "requested" && (
              <>
                <Button className="w-full" loading={busy} onClick={() => run(() => approveReturn(ret.id), "Return approved — pickup booked")}><Check className="size-4" />Approve & book pickup</Button>
                <Button variant="danger" className="w-full" onClick={() => setRejectOpen(true)}><X className="size-4" />Reject</Button>
              </>
            )}
            {manage && ret.status === "approved" && (
              <>
                <Button variant="secondary" className="w-full" loading={busy} onClick={() => run(() => retryReturnPickup(ret.id), "Pickup re-booked")}><RefreshCw className="size-4" />Retry pickup</Button>
                <Button className="w-full" loading={busy} onClick={() => run(() => receiveReturn(ret.id), "Marked received")}><PackageCheck className="size-4" />Mark received</Button>
              </>
            )}
            {manage && ret.status === "received" && (
              <Button className="w-full" onClick={() => setInspectOpen(true)}><SearchCheck className="size-4" />Complete inspection</Button>
            )}
            {manage && !["requested", "approved", "received"].includes(ret.status) && (
              <p className="text-sm text-faint">Status “{titleCase(ret.status)}” — no further actions.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {rejectOpen && <RejectDialog ret={ret} onClose={() => setRejectOpen(false)} onDone={(r) => { onChange(r); setRejectOpen(false); }} />}
      {inspectOpen && <InspectDialog ret={ret} onClose={() => setInspectOpen(false)} onDone={(r) => { onChange(r); setInspectOpen(false); }} />}
    </div>
  );
}

function RejectDialog({ ret, onClose, onDone }: { ret: Return; onClose: () => void; onDone: (r: Return) => void }) {
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    const parsed = rejectReturnSchema.safeParse({ rejection_reason: reason });
    if (!parsed.success) return setErr(parsed.error.flatten().fieldErrors.rejection_reason?.[0] ?? "");
    setBusy(true);
    try { onDone(await rejectReturn(ret.id, reason)); toast.success("Return rejected"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Reject return">
        <div className="space-y-4">
          <Field label="Rejection reason" required error={err}><Textarea value={reason} invalid={!!err} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button variant="danger" size="sm" loading={busy} onClick={submit}>Reject</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InspectDialog({ ret, onClose, onDone }: { ret: Return; onClose: () => void; onDone: (r: Return) => void }) {
  const [passed, setPassed] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit() {
    setBusy(true);
    try {
      const r = await inspectReturn(ret.id, passed, note);
      toast.success(passed ? "Passed — refund initiated" : "Failed inspection");
      onDone(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Complete inspection" description="Passing initiates a refund; failing marks it rejected on inspection.">
        <div className="space-y-4">
          <ToggleField label="Inspection passed" hint={passed ? "Refund will be initiated" : "Return will be rejected"} checked={passed} onCheckedChange={setPassed} />
          <Field label="Inspection note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} onClick={submit}>Save inspection</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted">{label}</span>{children}</div>;
}
