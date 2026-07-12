"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

/**
 * Gate a page on a permission codename. Roles without it would get a 403 from
 * the seam anyway; this shows a friendly message instead of an error state.
 */
export function RequirePermission({
  perm,
  children,
}: {
  perm: string;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (!can(perm)) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="No access"
          description={`Your role doesn't grant "${perm}". Ask an owner to update your permissions.`}
        />
      </Card>
    );
  }
  return <>{children}</>;
}
