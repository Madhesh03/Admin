"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/products/product-form";
import { RequirePermission } from "@/components/permission-gate";

export default function NewProductPage() {
  const router = useRouter();

  // Go back in history rather than a fixed push, so the products list's
  // filters/page (carried in its URL) are restored instead of reset.
  function backToList() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/products");
    }
  }

  return (
    <RequirePermission perm="catalog.add_product">
      <PageHeader
        title="Add product"
        description="Create a draft. SKU is auto-generated; add images and publish after saving."
        onBack={backToList}
      />
      <ProductForm />
    </RequirePermission>
  );
}
