/**
 * Zod schemas for admin forms. Reused client-side today; the same schemas can
 * validate server-side once the backend lands.
 */
import { z } from "zod";
import { METAL_TYPES, STOCK_TYPES } from "./types";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const metalEnum = z.enum(METAL_TYPES as [string, ...string[]]);
const stockEnum = z.enum(STOCK_TYPES as [string, ...string[]]);

export const stoneSchema = z.object({
  type: z.string().trim(),
  weight: z.string().trim(),
  quality: z.string().trim(),
  count: z.coerce.number().int().min(0).default(1),
});

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  price: z.coerce.number({ message: "Price is required" }).min(0, "Price can't be negative"),
  metal_type: metalEnum,
  sku: z.string().trim().optional(),
  description: z.string().trim().default(""),
  category_id: z.string().nullable().optional(),
  collection_id: z.string().nullable().optional(),
  discount_percent: z.coerce.number().min(0, "0–100").max(100, "0–100").default(0),
  stock_type: stockEnum,
  status: z.enum(["draft", "active", "out_of_stock", "archived"]).optional(),
  purity: z.string().trim().default("925 Sterling"),
  gross_weight: z.union([z.coerce.number().min(0), z.null()]).optional(),
  net_weight: z.union([z.coerce.number().min(0), z.null()]).optional(),
  stone_details: z.array(stoneSchema).default([]),
  certificate_details: z.record(z.string(), z.string()).default({}),
  available_sizes: z.string().trim().default(""),
  size_unit: z.string().trim().default(""),
  care_instruction: z.string().trim().default(""),
  is_featured: z.boolean().default(false),
  tags: z.array(z.string().trim()).default([]),
});
export type ProductFormParsed = z.output<typeof productFormSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  parent: z.string().nullable().optional(),
  description: z.string().trim().default(""),
  image_key: z.string().trim().default(""),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const collectionSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  description: z.string().trim().default(""),
  banner_image_key: z.string().trim().default(""),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  contact_name: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]).default(""),
  address: z.string().trim().default(""),
  gstin: z.string().trim().max(15, "GSTIN is 15 characters").default(""),
  notes: z.string().trim().default(""),
  is_active: z.boolean().default(true),
});

export const adjustStockSchema = z.object({
  new_qty: z.coerce.number({ message: "Enter a number" }).int("Whole units").min(0, "Can't be negative"),
  note: z.string().trim().min(1, "A note is required"),
});

export const refundSchema = z.object({
  amount: z.union([z.literal(""), z.coerce.number().positive("Must be positive")]).optional(),
  reason: z.string().trim().default(""),
});

export const staffSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  first_name: z.string().trim().default(""),
  last_name: z.string().trim().default(""),
  role_id: z.string().min(1, "Select a role"),
});

export const rejectReturnSchema = z.object({
  rejection_reason: z.string().trim().min(1, "A reason is required"),
});
