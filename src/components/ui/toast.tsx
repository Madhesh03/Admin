"use client";

import * as React from "react";
import { create } from "zustand";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, variant: ToastVariant) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, variant) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper usable outside React tree. */
export const toast = {
  success: (m: string) => useToastStore.getState().push(m, "success"),
  error: (m: string) => useToastStore.getState().push(m, "error"),
  info: (m: string) => useToastStore.getState().push(m, "info"),
};

const ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};
const STYLE: Record<ToastVariant, string> = {
  success: "border-green-200 text-green-800",
  error: "border-red-200 text-red-800",
  info: "border-line text-ink",
};
const ICON_COLOR: Record<ToastVariant, string> = {
  success: "text-green-600",
  error: "text-red-600",
  info: "text-forest",
};

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg",
              STYLE[t.variant],
            )}
          >
            <Icon className={cn("mt-0.5 size-5 shrink-0", ICON_COLOR[t.variant])} />
            <p className="flex-1 text-sm font-medium text-ink">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-faint transition-colors hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
