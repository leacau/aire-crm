// src/lib/validators/advertising.ts
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

// 🟢 SCHEMA SRL CORREGIDO Y BLINDADO
export const srlItemSchema = z.object({
  month: z.string(), 
  programId: z.string().min(1, "Seleccione un programa"),
  adType: z.enum(srlAdTypes),
  hasTv: z.boolean().default(false),
  // z.coerce.number() fuerza a que si recibe "" o undefined no se rompa y lo asuma como 0
  seconds: z.coerce.number().optional().default(0),
  // dailySpots acepta cualquier estructura (nuestra lógica en pantalla ya calcula Number() || 0, así que es 100% seguro)
  dailySpots: z.record(z.string(), z.any()).optional().default({}), 
  unitRate: z.coerce.number().min(0).optional().default(0),
});

// 🟢 SCHEMA SAS CORREGIDO Y BLINDADO
export const sasItemSchema = z.object({
  format: z.enum(sasFormats),
  type: z.string().optional(),
  detail: z.string().optional(),
  observations: z.string().optional(),
  desktop: z.boolean().default(false),
  mobile: z.boolean().default(false),
  home: z.boolean().default(false),
  interiores: z.boolean().default(false),
  cpm: z.coerce.number().optional().default(0),
  url: z.string().optional().or(z.literal("")),
  unitRate: z.coerce.number().min(0).optional().default(0),
});

// 🟢 SCHEMA PRINCIPAL
export const advertisingOrderSchema = z.object({
  clientId: z.string().min(1, "El cliente es obligatorio"),
  agencyId: z.string().optional(),
  
  opportunityId: z.string().optional(), 
  newOpportunityTitle: z.string().optional(),
  product: z.string().optional(), 
  
  accountExecutive: z.string().optional(),
  tangoOrderNo: z.string().optional(),
  
  startDate: z.date({ required_error: "Falta fecha de inicio" }),
  endDate: z.date({ required_error: "Falta fecha de fin" }),
  
  materialSent: z.boolean().default(false),
  observations: z.string().optional(),
  certReq: z.boolean().default(false),
  agencySale: z.boolean().default(false),
  // Blindado contra vacíos
  commissionSrl: z.coerce.number().optional().default(0),
  
  srlItems: z.array(srlItemSchema).default([]),
  sasItems: z.array(sasItemSchema).default([]),
  
  // Blindado contra vacíos
  adjustmentSrl: z.coerce.number().optional().default(0),
  adjustmentSas: z.coerce.number().optional().default(0),
});

export type AdvertisingOrderFormValues = z.infer<typeof advertisingOrderSchema>;
