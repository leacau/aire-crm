import type { OpportunityStage, TipoEntidad, CondicionIVA, AreaType, ScreenName, ScreenPermission } from './types';

export const defaultPermissions: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>> = {
    'Comercial': {
        Dashboard: { view: true, edit: true },
        Objectives: { view: true, edit: true },
        Opportunities: { view: true, edit: true },
        Prospects: { view: true, edit: true },
        Clients: { view: true, edit: true },
        Grilla: { view: true, edit: true },
        PNTs: { view: true, edit: true },
        Canjes: { view: true, edit: true },
        Invoices: { view: true, edit: true },
        Billing: { view: true, edit: true },
        Chat: { view: true, edit: true },
        Calendar: { view: true, edit: true },
        Licenses: { view: true, edit: true },
        Approvals: { view: true, edit: true },
        Activity: { view: true, edit: true },
        Team: { view: true, edit: true },
        Rates: { view: true, edit: true },
        Reports: { view: true, edit: true },
        Quotes: { view: true, edit: true },
        Import: { view: true, edit: true },
        TangoMapping: { view: true, edit: true },
    },
    'Recursos Humanos': {
        Licenses: { view: true, edit: true },
        Canjes: { view: true, edit: true },
        Team: { view: true, edit: true },
        Quotes: { view: true, edit: true },
    },
    'Pautado': {
        Clients: { view: true, edit: false },
        Opportunities: { view: true, edit: false },
        PNTs: { view: true, edit: true },
        Grilla: { view: true, edit: true },
        Quotes: { view: true, edit: true },
    },
    'Administración': {
        Dashboard: { view: true, edit: true },
        Objectives: { view: true, edit: true },
        Opportunities: { view: true, edit: true },
        Clients: { view: true, edit: true },
        Canjes: { view: true, edit: true },
        Invoices: { view: true, edit: true },
        Billing: { view: true, edit: true },
        Chat: { view: true, edit: true },
        Team: { view: true, edit: true },
        Rates: { view: true, edit: true },
        Reports: { view: true, edit: true },
        Quotes: { view: true, edit: true },
        Import: { view: true, edit: true },
        TangoMapping: { view: true, edit: true },
    },
    'Programación': {
        Grilla: { view: true, edit: false },
        PNTs: { view: true, edit: false },
        Quotes: { view: true, edit: true },
    },
    'Redacción': {
         PNTs: { view: true, edit: false },
         Quotes: { view: true, edit: true },
    }
};

export const opportunityStages: (OpportunityStage | 'Ganado (Recurrente)')[] = [
  'Nuevo',
  'Propuesta',
  'Negociación',
  'Negociación a Aprobar',
  'Cerrado - Ganado',
  'Ganado (Recurrente)',
  'Cerrado - No Definido',
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
