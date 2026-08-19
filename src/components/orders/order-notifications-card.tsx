"use client";

import * as React from "react";
import { Check, Mail, MessageCircle, RotateCw, X } from "lucide-react";
import { listNotifications, resendNotification } from "@/lib/admin-api";
import {
  NOTIFICATION_EVENT_LABEL,
  type NotificationEventType,
  type NotificationLog,
  type Order,
} from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Spinner } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/** Events staff can sensibly re-send by hand. */
const RESENDABLE: NotificationEventType[] = [
  "order_placed",
  "payment_confirmed",
  "order_packed",
  "order_shipped",
  "out_for_delivery",
  "order_delivered",
  "order_cancelled",
  "refund_initiated",
];

/**
 * What the customer was actually told, and whether it landed.
 *
 * Delivery is fire-and-forget through Celery, so a bounced shipping email used
 * to be invisible until the customer complained. Failures show the provider's
 * own error and can be re-sent from here.
 */
export function OrderNotificationsCard({
  order,
  refreshKey,
}: {
  order: Order;
  refreshKey: number;
}) {
  const { can } = useAuth();
  const [logs, setLogs] = React.useState<NotificationLog[] | null>(null);
  const [resendEvent, setResendEvent] = React.useState<NotificationEventType | "">("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const page = await listNotifications({ order_id: order.id });
      setLogs(page.items);
    } catch {
      setLogs([]);
    }
  }, [order.id]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function resend() {
    if (!resendEvent) return;
    setBusy(true);
    try {
      const sent = await resendNotification({
        order_id: order.id,
        event_type: resendEvent,
      });
      const failed = sent.filter((s) => s.status === "failed");
      if (failed.length) toast.error(`Failed: ${failed[0].error || "provider rejected it"}`);
      else toast.success(`Re-sent “${NOTIFICATION_EVENT_LABEL[resendEvent]}”`);
      setResendEvent("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-send");
    } finally {
      setBusy(false);
    }
  }

  const failures = logs?.filter((l) => l.status === "failed").length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer notifications</CardTitle>
        {failures > 0 && (
          <span className="text-xs font-semibold text-red-600">
            {failures} failed
          </span>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {logs === null ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-faint">Nothing sent for this order yet.</p>
        ) : (
          <ul className="space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    l.status === "sent"
                      ? "bg-green-100 text-green-700"
                      : l.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-surface text-faint",
                  )}
                >
                  {l.status === "sent" ? (
                    <Check className="size-3.5" />
                  ) : l.status === "failed" ? (
                    <X className="size-3.5" />
                  ) : (
                    <RotateCw className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {l.channel === "email" ? (
                      <Mail className="size-3.5 text-faint" />
                    ) : (
                      <MessageCircle className="size-3.5 text-faint" />
                    )}
                    {NOTIFICATION_EVENT_LABEL[l.event_type] ?? l.event_type}
                  </p>
                  <p className="truncate text-xs text-faint">
                    {l.recipient_email || l.recipient_phone} ·{" "}
                    {formatDateTime(l.sent_at ?? l.created_at)}
                  </p>
                  {l.status === "failed" && l.error && (
                    <p className="mt-0.5 break-words text-xs text-red-600">{l.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {can("orders.update_order_status") && (
          <div className="flex gap-2 border-t border-line pt-3">
            <NativeSelect
              className="h-9 text-xs"
              value={resendEvent}
              onChange={(e) => setResendEvent(e.target.value as NotificationEventType)}
            >
              <option value="">Re-send…</option>
              {RESENDABLE.map((e) => (
                <option key={e} value={e}>{NOTIFICATION_EVENT_LABEL[e]}</option>
              ))}
            </NativeSelect>
            <Button size="sm" loading={busy} disabled={!resendEvent} onClick={resend}>
              Send
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
