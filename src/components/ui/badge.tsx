import * as React from "react";
import { cn } from "@/lib/utils";
import {
  titleCase,
  type OrderStatus,
  type PaymentStatus,
  type ProductStatus,
  type PurchaseOrderStatus,
  type ReturnStatus,
  type ShipmentStatus,
} from "@/lib/types";
import type { StockLevel } from "@/lib/derive";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  );
}

const GREEN = "bg-green-100 text-green-700";
const AMBER = "bg-amber-100 text-amber-700";
const BLUE = "bg-blue-100 text-blue-700";
const RED = "bg-red-100 text-red-700";
const SAGE = "bg-sage text-forest";
const GREY = "bg-surface text-muted";
const PURPLE = "bg-purple-100 text-purple-700";

const ORDER_CLASS: Record<OrderStatus, string> = {
  pending: SAGE,
  paid: SAGE,
  processing: AMBER,
  shipped: BLUE,
  delivered: GREEN,
  cancelled: RED,
  returned: PURPLE,
  refunded: GREY,
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={ORDER_CLASS[status]}>{titleCase(status)}</Badge>;
}

const PAYMENT_CLASS: Record<PaymentStatus, string> = {
  created: GREY,
  authorized: SAGE,
  captured: GREEN,
  failed: RED,
  refunded: GREY,
  partially_refunded: AMBER,
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge className={PAYMENT_CLASS[status]}>{titleCase(status)}</Badge>;
}

const PRODUCT_CLASS: Record<ProductStatus, string> = {
  active: GREEN,
  draft: GREY,
  out_of_stock: AMBER,
  archived: RED,
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge className={PRODUCT_CLASS[status]}>{titleCase(status)}</Badge>;
}

const STOCK_CLASS: Record<StockLevel, string> = { out: RED, low: AMBER, healthy: GREEN };
const STOCK_LABEL: Record<StockLevel, string> = {
  out: "Out of stock",
  low: "Low stock",
  healthy: "In stock",
};
export function StockBadge({ level }: { level: StockLevel }) {
  return <Badge className={STOCK_CLASS[level]}>{STOCK_LABEL[level]}</Badge>;
}

const RETURN_CLASS: Record<ReturnStatus, string> = {
  requested: SAGE,
  approved: BLUE,
  rejected: RED,
  shipped_back: BLUE,
  received: AMBER,
  inspected: AMBER,
  rejected_inspection: RED,
  refund_initiated: PURPLE,
  completed: GREEN,
};
export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <Badge className={RETURN_CLASS[status]}>{titleCase(status)}</Badge>;
}

const SHIP_CLASS: Record<ShipmentStatus, string> = {
  pending: GREY,
  booked: SAGE,
  picked_up: BLUE,
  in_transit: BLUE,
  out_for_delivery: AMBER,
  delivered: GREEN,
  failed: RED,
  returned: PURPLE,
};
export function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return <Badge className={SHIP_CLASS[status]}>{titleCase(status)}</Badge>;
}

const PO_CLASS: Record<PurchaseOrderStatus, string> = {
  draft: GREY,
  ordered: BLUE,
  partial: AMBER,
  received: GREEN,
  cancelled: RED,
};
export function PoStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return <Badge className={PO_CLASS[status]}>{titleCase(status)}</Badge>;
}
