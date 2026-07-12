"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Spinner } from "@/components/ui/states";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { staff, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !staff) router.replace("/login");
  }, [loading, staff, router]);

  // Route guard: block render until the (mock) session is resolved.
  if (loading || !staff) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-7" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
