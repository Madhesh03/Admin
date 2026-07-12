"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/products/product-form";
import { RequirePermission } from "@/components/permission-gate";

export default function NewProductPage() {
  return (
    <RequirePermission perm="catalog.add_product">
      <PageHeader
        title="Add product"
        description="Create a draft. SKU is auto-generated; add images and publish after saving."
        backHref="/products"
      />
      <ProductForm />
    </RequirePermission>
  );
}
