import { z } from "zod";

export const srlAdTypes = [
  "Spot",
  "PNT",
  "Auspicio",
  "Micro",
  "Nota Comercial",
  "Sorteo",
  "Juego",
  "Cobertura Festival",
] as const;

export const sasFormats = [
  "Banner",
  "Nota_Web",
  "Redes",
  "Cobertura Festival",
] as const;

export const srlItemSchema = z.object({
  programId: z.string().min(1, "Seleccione un programa"),
  adType: z.enum(srlAdTypes),
  seconds: z.number().optional(), // Solo para Spot
  dailySpots: z.record(z.string(), z.number()), // Key: YYYY-MM-DD, Value: Cantidad
  unitRate: z.number().min(0),
});

export const sasItemSchema = z.object({
  format: z.enum(sasFormats),
  type: z.string().optional(),
  detail: z.string().optional(),
  observations: z.string().optional(),
  desktop: z.boolean().default(false),
  mobile: z.boolean().default(false),
  home: z.boolean().default(false),
  interiores: z.boolean().default(false),
  cpm: z.number().optional(), // Solo para Banner
  url: z.string().url().optional().or(z.literal("")),
  unitRate: z.number().min(0),
});

export const advertisingOrderSchema = z.object({
  // Header
  clientId: z.string().min(1, "Seleccione un anunciante"),
  agencyId: z.string().optional(),
  product: z.string().min(1, "Ingrese el producto"),
  accountExecutive: z.string().optional(),
  
  // SRL Header fields
  tangoOrderNo: z.string().optional(),
  startDate: z.date({ required_error: "Fecha de inicio requerida" }),
  endDate: z.date({ required_error: "Fecha de fin requerida" }),
  materialSent: z.boolean().default(false),
  observations: z.string().optional(),
  certReq: z.boolean().default(false),
  agencySale: z.boolean().default(false),
  commissionSrl: z.number().default(0),
  
  // Items
  srlItems: z.array(srlItemSchema).default([]),
  sasItems: z.array(sasItemSchema).default([]),
  
  // Financials SRL
  adjustmentSrl: z.number().default(0),
  
  // Financials SAS
  adjustmentSas: z.number().default(0),
});

export type AdvertisingOrderFormValues = z.infer<typeof advertisingOrderSchema>;
export type SrlItem = z.infer<typeof srlItemSchema>;
export type SasItem = z.infer<typeof sasItemSchema>;
