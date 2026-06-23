import { z } from "zod";

export const srlAdTypes = [
  "Spot", "PNT", "Auspicio", "Micro", "Nota Comercial", "Sorteo", "Juego", "Cobertura Festival", "Personalizado" 
] as const;

export const sasFormats = [
  "Banner", "Nota_Web", "Redes", "Cobertura Festival", "Gacetilla de prensa", "Personalizado" 
] as const;

export const srlItemSchema = z.object({
  month: z.string(), 
  programId: z.string().min(1, "Seleccione un programa"),
  adType: z.string().min(1, "Obligatorio"), 
  customType: z.string().optional(), 
  hasTv: z.boolean().default(false),
  seconds: z.coerce.number().optional().default(0),
  dailySpots: z.record(z.string(), z.any()).optional().default({}), 
  unitRate: z.coerce.number().min(0).optional().default(0),
});

export const sasItemSchema = z.object({
  month: z.string(), 
  format: z.string().min(1, "Obligatorio"), 
  type: z.string().optional(),
  detail: z.string().optional(),
  customDetail: z.string().optional(), 
  observations: z.string().optional(),
  desktop: z.boolean().default(false),
  mobile: z.boolean().default(false),
  home: z.boolean().default(false),
  interiores: z.boolean().default(false),
  cpm: z.coerce.number().optional().default(0),
  url: z.string().optional().or(z.literal("")),
  unitRate: z.coerce.number().min(0).optional().default(0),
});

// 🟢 ESQUEMA BASE ACTUALIZADO CON ATRIBUTOS DE PAGO
export const billingRequestItemSchema = z.object({
  date: z.string().min(1, "Obligatorio"),
  grossAmount: z.coerce.number().min(0).default(0),
  adjustment: z.coerce.number().min(0).default(0),
  amount: z.coerce.number().min(0).default(0),
  paymentType: z.enum(["Se paga", "Canje", "Mixto"]).default("Se paga"),
  canjeDescription: z.string().optional().default("")
});

export const billingRequestSasItemSchema = z.object({
  date: z.string().min(1, "Obligatorio"),
  grossAmount: z.coerce.number().min(0).default(0),
  adjustment: z.coerce.number().min(0).default(0),
  ivaSas: z.coerce.number().min(0).default(0),
  amount: z.coerce.number().min(0).default(0),
  paymentType: z.enum(["Se paga", "Canje", "Mixto"]).default("Se paga"),
  canjeDescription: z.string().optional().default("")
});

export const advertisingOrderSchema = z.object({
  clientId: z.string().min(1, "El cliente es obligatorio"),
  canjeId: z.string().optional(),
  agencyId: z.string().optional(),
  opportunityId: z.string().min(1, "La oportunidad Cerrado - Ganado es obligatoria"),
  newOpportunityTitle: z.string().optional(),
  product: z.string().optional(), 
  event: z.string().optional(),
  accountExecutive: z.string().optional(),
  tangoOrderNo: z.string().optional(),
  startDate: z.date({ required_error: "Falta fecha de inicio" }),
  endDate: z.date({ required_error: "Falta fecha de fin" }),
  materialSent: z.boolean().default(false),
  materialUrl: z.string().optional(), 
  observations: z.string().optional(),
  certReq: z.boolean().default(false),
  agencySale: z.boolean().default(false),
  commissionSrl: z.coerce.number().optional().default(0),
  srlItems: z.array(srlItemSchema).default([]),
  sasItems: z.array(sasItemSchema).default([]),
  adjustmentSrl: z.coerce.number().optional().default(0),
  adjustmentSas: z.coerce.number().optional().default(0),
  
  billingRequestsSrl: z.array(billingRequestItemSchema).optional().default([]),
  billingRequestsSas: z.array(billingRequestSasItemSchema).optional().default([]),
  // 🟢 REGISTRO PARA ENTRADAS EN AVIÓN
  billingRequestsAvion: z.array(billingRequestItemSchema).optional().default([]),
}).superRefine((val, ctx) => {
  if ((val.adjustmentSrl > 0 || val.adjustmentSas > 0) && (!val.observations || val.observations.trim() === "")) {
      ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Es obligatorio dejar una observación aclarando el motivo del desajuste.",
          path: ["observations"]
      });
  }
});

export type AdvertisingOrderFormValues = z.infer<typeof advertisingOrderSchema>;
