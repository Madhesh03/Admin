/**
 * Internal storage shapes (not part of the API contract). Products are stored
 * "normalized" with FK ids; the seam composes ProductList/ProductDetail by
 * joining categories/collections and computing derived fields — exactly how the
 * backend does it. Everything else is stored in its API shape.
 */
import type {
  MetalType,
  ProductMedia,
  ProductStatus,
  StockType,
  StoneDetail,
} from "./types";

export interface StoredProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  category_id: string | null;
  collection_id: string | null;
  price: number;
  discount_percent: number;
  stock_type: StockType;
  qty: number;
  status: ProductStatus;
  metal_type: MetalType;
  purity: string;
  gross_weight: number | null;
  net_weight: number | null;
  stone_details: StoneDetail[];
  certificate_details: Record<string, string>;
  available_sizes: string;
  size_unit: string;
  care_instruction: string;
  is_featured: boolean;
  tags: string[];
  media: ProductMedia[];
  created_at: string;
  updated_at: string;
}
