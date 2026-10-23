import type { Role } from "./jwt";

export function homeFor(role: Role): string {
  switch (role) {
    case "admin": return "/admin";
    case "manufacturer": return "/manufacturer/products";
    case "distributor":
    case "retailer": return "/shipments";
    default: return "/alerts";
  }
}

export const NAV: Record<Role, { href: string; label: string }[]> = {
  admin: [
    { href: "/admin", label: "Organizations" },
    { href: "/alerts", label: "Alerts" },
    { href: "/network", label: "Network" },
    { href: "/recall", label: "Recall" },
    { href: "/analytics", label: "Analytics" },
  ],
  manufacturer: [
    { href: "/manufacturer/products", label: "Products & batches" },
    { href: "/inventory", label: "Inventory" },
    { href: "/shipments", label: "Shipments" },
    { href: "/network", label: "Network" },
    { href: "/recall", label: "Recall" },
  ],
  distributor: [
    { href: "/inventory", label: "Inventory" },
    { href: "/shipments", label: "Shipments" },
  ],
  retailer: [
    { href: "/inventory", label: "Inventory" },
    { href: "/shipments", label: "Shipments" },
  ],
  auditor: [{ href: "/alerts", label: "Alerts" }],
};
