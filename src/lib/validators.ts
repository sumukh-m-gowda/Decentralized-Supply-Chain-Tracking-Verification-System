import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  role: z.enum(["manufacturer", "distributor", "retailer", "auditor"]),
  orgName: z.string().trim().min(2).max(120).optional(),
  licenseNo: z.string().trim().min(3).max(60).optional(),
}).refine((v) => v.role === "auditor" || (v.orgName && v.licenseNo), {
  message: "Organization name and license number are required",
  path: ["orgName"],
});

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  sku: z.string().trim().min(2).max(60),
});
export const batchSchema = z.object({
  product_id: z.number().int().positive(),
  manufacture_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().int().min(1).max(1000),
}).refine((v) => v.expiry_date > v.manufacture_date, { message: "Expiry must be after manufacture date", path: ["expiry_date"] });
export const shipmentSchema = z.object({
  to_org: z.number().int().positive(),
  item_ids: z.array(z.number().int().positive()).min(1).max(1000),
});
export const sensorSchema = z.object({
  temperature: z.number().min(-100).max(100),
  humidity: z.number().min(0).max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  ts: z.string().datetime().optional(),
});
export const reportSchema = z.object({
  serial_no: z.string().trim().max(80).optional(),
  description: z.string().trim().min(5).max(500),
});
export const approveSchema = z.object({ status: z.enum(["approved", "rejected"]) });
export const sellSchema = z.object({ item_ids: z.array(z.number().int().positive()).min(1).max(500) });
