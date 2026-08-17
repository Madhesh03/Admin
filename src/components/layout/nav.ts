import {
  LayoutDashboard,
  Package,
  FolderTree,
  Layers,
  ShoppingBag,
  Truck,
  Users,
  Boxes,
  Factory,
  ClipboardList,
  UserCog,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission codename required to see this item (owner sees all). */
  perm?: string;
  match: (pathname: string) => boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const startsWith = (base: string) => (p: string) =>
  p === base || p.startsWith(base + "/");

export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "orders.view_order", match: (p) => p === "/" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/products", label: "Products", icon: Package, perm: "catalog.view_product", match: startsWith("/products") },
      { href: "/categories", label: "Categories", icon: FolderTree, perm: "catalog.view_product", match: startsWith("/categories") },
      { href: "/collections", label: "Collections", icon: Layers, perm: "catalog.view_product", match: startsWith("/collections") },
      // Hidden: Reviews module
      // { href: "/reviews", label: "Reviews", icon: Star, perm: "catalog.view_product", match: startsWith("/reviews") },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/orders", label: "Orders", icon: ShoppingBag, perm: "orders.view_order", match: startsWith("/orders") },
      // Hidden: Returns module
      // { href: "/returns", label: "Returns", icon: Undo2, perm: "orders.view_order", match: startsWith("/returns") },
      { href: "/shipments", label: "Shipments", icon: Truck, perm: "shipping.manage_shipment", match: startsWith("/shipments") },
      // Hidden: Refunds module
      // { href: "/refunds", label: "Refunds", icon: IndianRupee, perm: "orders.view_order", match: startsWith("/refunds") },
      { href: "/customers", label: "Customers", icon: Users, perm: "orders.view_order", match: startsWith("/customers") },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/stock", label: "Stock", icon: Boxes, perm: "inventory.view_stock_ledger", match: startsWith("/stock") },
      { href: "/suppliers", label: "Suppliers", icon: Factory, perm: "inventory.view_supplier", match: startsWith("/suppliers") },
      { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList, perm: "inventory.view_purchase_order", match: startsWith("/purchase-orders") },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/staff", label: "Staff & Roles", icon: UserCog, perm: "accounts.manage_staff", match: startsWith("/staff") },
    ],
  },
];

/** Flattened list for matching the active item / page titles. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
