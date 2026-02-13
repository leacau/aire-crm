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

export const srlItemSchema = z.object({
  month: z.string(), 
  programId: z.string().min(1, "Seleccione un programa"),
  adType: z.enum(srlAdTypes),
  hasTv: z.boolean().default(false),
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
  // Header
  clientId: z.string().min(1, "El cliente es obligatorio"),
  agencyId: z.string().optional(),
  
  // Oportunidad (Producto)
  // Hacemos opcional el ID para manejar la lógica de "Nueva" manualmente, 
  // pero validaremos en el formulario que se elija algo.
  opportunityId: z.string().optional(), 
  newOpportunityTitle: z.string().optional(),

  // Campos que ya no son obligatorios o se calculan
  product: z.string().optional(), 
  
  accountExecutive: z.string().optional(),
  
  // SRL Header fields
  tangoOrderNo: z.string().optional(),
  
  // Fechas: Zod espera Date objects
  startDate: z.date({ required_error: "Falta fecha de inicio", invalid_type_error: "Fecha inicio inválida" }),
  endDate: z.date({ required_error: "Falta fecha de fin", invalid_type_error: "Fecha fin inválida" }),
  
  materialSent: z.boolean().default(false),
  observations: z.string().optional(),
  certReq: z.boolean().default(false),
  agencySale: z.boolean().default(false),
  commissionSrl: z.number().default(0),
  
  // Items
  srlItems: z.array(srlItemSchema).default([]),
  sasItems: z.array(sasItemSchema).default([]),
  
  // Financials
  adjustmentSrl: z.number().default(0),
  adjustmentSas: z.number().default(0),
});

export type AdvertisingOrderFormValues = z.infer<typeof advertisingOrderSchema>;
