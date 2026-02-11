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

// Esquema SRL Actualizado
export const srlItemSchema = z.object({
  month: z.string(), // Fundamental para separar tablas
  programId: z.string().min(1, "Seleccione un programa"),
  adType: z.enum(srlAdTypes),
  hasTv: z.boolean().default(false), // Nuevo
  seconds: z.number().optional(),
  dailySpots: z.record(z.string(), z.number()), 
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
  cpm: z.number().optional(),
  url: z.string().optional().or(z.literal("")),
  unitRate: z.number().min(0),
});

export const advertisingOrderSchema = z.object({
  clientId: z.string().min(1, "Seleccione un anunciante"),
  agencyId: z.string().optional(),
  
  // Cambiamos "product" por vinculación a oportunidad
  opportunityId: z.string().optional(), // Puede ser ID existente o "new:Nombre"
  newOpportunityTitle: z.string().optional(), // Para crear una nueva

  accountExecutive: z.string().optional(),
  
  tangoOrderNo: z.string().optional(),
  startDate: z.date({ required_error: "Fecha de inicio requerida" }),
  endDate: z.date({ required_error: "Fecha de fin requerida" }),
  materialSent: z.boolean().default(false),
  observations: z.string().optional(),
  certReq: z.boolean().default(false),
  agencySale: z.boolean().default(false),
  commissionSrl: z.number().default(0),
  
  srlItems: z.array(srlItemSchema).default([]),
  sasItems: z.array(sasItemSchema).default([]),
  
  adjustmentSrl: z.number().default(0),
  adjustmentSas: z.number().default(0),
});

export type AdvertisingOrderFormValues = z.infer<typeof advertisingOrderSchema>;
