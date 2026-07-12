"use client";

import { useParams } from "next/navigation";
import { PackageX } from "lucide-react";
import { getProduct } from "@/lib/admin-api";
import type { ProductDetail } from "@/lib/types";
import { useAsync } from "@/lib/use-async";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/products/product-form";
import { RequirePermission } from "@/components/permission-gate";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync<ProductDetail | null>(
    () => getProduct(id),
    [id],
  );

  return (
    <RequirePermission perm="catalog.view_product">
      <PageHeader
        title={data ? data.name : "Edit product"}
        description={data?.sku}
        backHref="/products"
      />
      {loading ? (
        <Card><LoadingState label="Loading product…" /></Card>
      ) : error ? (
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      ) : !data ? (
        <Card><EmptyState icon={PackageX} title="Product not found" description="It may have been removed." /></Card>
      ) : (
        <ProductForm product={data} onSaved={reload} />
      )}
    </RequirePermission>
  );
}
