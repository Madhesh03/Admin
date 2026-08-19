"use client";

import * as React from "react";
import { Package, Star, Truck, Zap, IndianRupee } from "lucide-react";
import { createShipment, listCourierRates } from "@/lib/admin-api";
import type { CourierRate, Order, Shipment } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { toast } from "@/components/ui/toast";

/** Parcel defaults: a typical jewellery box, overridden by what staff measure. */
const DEFAULTS = { weight: "0.5", length: "16", breadth: "12", height: "6" };

/**
 * Book a parcel with a courier chosen against its actual price.
 *
 * Two steps on purpose. Weight and dimensions come first because they *set*
 * the price — quoting before measuring is how every parcel ends up booked at
 * the 0.5 kg default and re-billed later. Then the rate card, with the cost of
 * each choice relative to the cheapest spelled out, so paying more for speed
 * is a decision someone made rather than one that happened.
 */
export function BookShipmentDialog({
  order,
  open,
  onOpenChange,
  onBooked,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onBooked: (s: Shipment) => void;
}) {
  const [weight, setWeight] = React.useState(DEFAULTS.weight);
  const [length, setLength] = React.useState(DEFAULTS.length);
  const [breadth, setBreadth] = React.useState(DEFAULTS.breadth);
  const [height, setHeight] = React.useState(DEFAULTS.height);
  const [cod, setCod] = React.useState(false);

  const [rates, setRates] = React.useState<CourierRate[] | null>(null);
  const [selected, setSelected] = React.useState<string>("");
  const [loadingRates, setLoadingRates] = React.useState(false);
  const [ratesError, setRatesError] = React.useState<string | null>(null);
  const [booking, setBooking] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setWeight(DEFAULTS.weight);
    setLength(DEFAULTS.length);
    setBreadth(DEFAULTS.breadth);
    setHeight(DEFAULTS.height);
    setCod(false);
    setRates(null);
    setSelected("");
    setRatesError(null);
  }, [open]);

  const parcel = {
    weight_kg: Number(weight),
    length_cm: Number(length),
    breadth_cm: Number(breadth),
    height_cm: Number(height),
  };
  const parcelValid =
    Number.isFinite(parcel.weight_kg) && parcel.weight_kg > 0 &&
    [parcel.length_cm, parcel.breadth_cm, parcel.height_cm].every(
      (v) => Number.isFinite(v) && v > 0,
    );

  // Couriers bill on the greater of dead and volumetric weight. Showing it
  // here explains a quote that looks too high for a light parcel in a big box.
  const volumetric = (parcel.length_cm * parcel.breadth_cm * parcel.height_cm) / 5000;
  const billable = Math.max(parcel.weight_kg || 0, volumetric || 0);

  async function fetchRates() {
    setLoadingRates(true);
    setRatesError(null);
    setSelected("");
    try {
      const result = await listCourierRates({ order_id: order.id, ...parcel, cod });
      setRates(result);
      // Pre-select the cheapest so the safe default needs no extra click.
      setSelected(result.find((r) => r.is_cheapest)?.courier_id ?? "");
    } catch (err) {
      setRatesError(err instanceof Error ? err.message : "Could not load courier rates");
      setRates(null);
    } finally {
      setLoadingRates(false);
    }
  }

  const chosen = rates?.find((r) => r.courier_id === selected);

  async function book() {
    if (!chosen) return;
    setBooking(true);
    try {
      const shipment = await createShipment({
        order_id: order.id,
        courier_id: chosen.courier_id,
        courier_name: chosen.courier_name,
        courier: chosen.courier,
        // The tax-inclusive total, so the stored figure matches what staff
        // were shown — and what the wallet is debited.
        freight_charge: chosen.rate_with_gst,
        cod,
        ...parcel,
      });
      toast.success(
        shipment.awb
          ? `Booked with ${chosen.courier_name} — AWB ${shipment.awb}`
          : `Booked with ${chosen.courier_name}. AWB pending — retry from the shipment page.`,
      );
      onBooked(shipment);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not book the shipment");
    } finally {
      setBooking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        title="Book shipment"
        description={`${order.order_number} · ${order.shipping_address.city} ${order.shipping_address.pincode}`}
      >
        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Package className="size-4 text-forest" />
              Parcel
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Weight (kg)" htmlFor="weight">
                <Input
                  id="weight"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
              <Field label="Length (cm)" htmlFor="len">
                <Input id="len" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} />
              </Field>
              <Field label="Breadth (cm)" htmlFor="brd">
                <Input id="brd" inputMode="decimal" value={breadth} onChange={(e) => setBreadth(e.target.value)} />
              </Field>
              <Field label="Height (cm)" htmlFor="hgt">
                <Input id="hgt" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2.5">
              <p className="text-xs text-muted">
                Billable weight{" "}
                <span className="font-semibold text-ink">{billable.toFixed(2)} kg</span>
                {volumetric > parcel.weight_kg && (
                  <span className="text-faint"> · volumetric ({volumetric.toFixed(2)} kg) exceeds actual</span>
                )}
              </p>
              <label className="flex items-center gap-2 text-xs font-medium text-ink">
                <Switch checked={cod} onCheckedChange={setCod} />
                Cash on delivery
              </label>
            </div>

            <Button
              variant="secondary"
              className="w-full"
              loading={loadingRates}
              disabled={!parcelValid}
              onClick={fetchRates}
            >
              <IndianRupee className="size-4" />
              {rates ? "Refresh rates" : "Get courier rates"}
            </Button>
            {!parcelValid && (
              <p className="text-xs text-red-600">
                Enter a positive weight and all three dimensions.
              </p>
            )}
          </section>

          {(loadingRates || ratesError || rates) && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Truck className="size-4 text-forest" />
                Couriers
              </div>

              {loadingRates ? (
                <LoadingState label="Pricing couriers…" />
              ) : ratesError ? (
                <ErrorState message={ratesError} onRetry={fetchRates} />
              ) : rates && rates.length === 0 ? (
                <EmptyState
                  title="No courier serves this route"
                  description="Check the delivery pincode, or try a lighter parcel."
                />
              ) : (
                <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {rates?.map((r) => (
                    <RateRow
                      key={r.courier_id}
                      rate={r}
                      selected={selected === r.courier_id}
                      onSelect={() => setSelected(r.courier_id)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <p className="text-xs text-faint">
              Booking assigns an AWB. The order moves to “Shipped” when the
              courier scans it as picked up.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" loading={booking} disabled={!chosen} onClick={book}>
                {chosen ? `Book · ${formatPrice(chosen.rate_with_gst)}` : "Book"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RateRow({
  rate,
  selected,
  onSelect,
}: {
  rate: CourierRate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-forest bg-sage/40 ring-1 ring-forest/30"
          : "border-line hover:bg-surface",
      )}
    >
      <span
        className={cn(
          "size-4 shrink-0 rounded-full border-2",
          selected ? "border-forest bg-forest" : "border-line-strong",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">
            {rate.courier_name}
          </span>
          {rate.is_cheapest && (
            <Badge className="bg-green-100 text-green-700">Cheapest</Badge>
          )}
          {rate.is_fastest && (
            <Badge className="bg-blue-100 text-blue-700">
              <Zap className="size-3" />
              Fastest
            </Badge>
          )}
          {rate.is_recommended && (
            <Badge className="bg-sage text-forest">Recommended</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-faint">
          {rate.estimated_delivery_days
            ? `${rate.estimated_delivery_days} day${rate.estimated_delivery_days === "1" ? "" : "s"}`
            : "ETA unknown"}
          {rate.etd ? ` · by ${rate.etd}` : ""}
          {rate.is_surface ? " · Surface" : " · Air"}
          {rate.rating > 0 && (
            <span className="ml-1 inline-flex items-center gap-0.5">
              · <Star className="size-3 fill-amber-400 text-amber-400" />
              {rate.rating.toFixed(1)}
            </span>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-ink">{formatPrice(rate.rate_with_gst)}</p>
        {rate.gst_amount > 0 && (
          <p className="text-xs text-faint">
            {formatPrice(rate.rate)} + {rate.gst_rate}% GST
          </p>
        )}
        {rate.extra_over_cheapest > 0 ? (
          <p className="text-xs font-medium text-amber-700">
            +{formatPrice(rate.extra_over_cheapest)}
          </p>
        ) : (
          <p className="text-xs text-faint">best price</p>
        )}
      </div>
    </button>
  );
}
