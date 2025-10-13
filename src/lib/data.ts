
import type { OpportunityStage, TipoEntidad, CondicionIVA } from './types';

export const opportunityStages: OpportunityStage[] = [
  'Nuevo',
  'Propuesta',
  'Negociación',
  'Negociación a Aprobar',
  'Cerrado - Ganado',
  'Cerrado - Perdido',
];

export const tipoEntidadOptions: TipoEntidad[] = ['Pública', 'Privada', 'Mixta'];

export const condicionIVAOptions: CondicionIVA[] = ['Responsable Inscripto', 'Monotributista', 'Exento', 'Consumidor Final'];

export const provinciasArgentina = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
  "Tucumán"
];
