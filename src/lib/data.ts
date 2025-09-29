



import type { Client, Opportunity, OpportunityStage, Person, TipoEntidad, ClientActivityType, CondicionIVA } from './types';

export const people: Person[] = [
    { id: 'person-1', name: 'Juan Perez', email: 'juan.perez@globalmedia.com', phone: '555-1111', clientIds: ['client-1'] },
    { id: 'person-2', name: 'Maria Rodriguez', email: 'maria.r@innovatesolutions.io', phone: '555-2222', clientIds: ['client-2'] },
    { id: 'person-3', name: 'Carlos Gomez', email: 'carlos.gomez@quantumleap.tech', phone: '555-3333', clientIds: ['client-3'] },
    { id: 'person-4', name: 'Ana Martinez', phone: '555-4444', clientIds: ['client-4', 'client-1'] },
    { id: 'person-5', name: 'Lucia Fernandez', email: 'lucia.f@apexdigital.com', phone: '555-5555', clientIds: ['client-5'] },
];

// This is now just initial mock data. The app will use Firestore.
export let clients: Client[] = [];

export const opportunityStages: OpportunityStage[] = [
  'Nuevo',
  'Propuesta',
  'Negociación',
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


export let opportunities: Opportunity[] = [
  {
    id: 'opp-1',
    title: 'Campaña Digital Q3',
    clientName: 'Global Media Inc.',
    clientId: 'client-1',
    value: 75000,
    stage: 'Negociación',
    closeDate: '2024-08-15',
    ownerId: 'user-1',
    ownerName: 'Alex Morgan',
    details: 'Campaña de marketing digital para el tercer trimestre, enfocada en redes sociales y SEO.'
  },
  {
    id: 'opp-2',
    title: 'Proyecto de Rediseño Web',
    clientName: 'Innovate Solutions',
    clientId: 'client-2',
    value: 120000,
    stage: 'Propuesta',
    closeDate: '2024-09-01',
    ownerId: 'user-2',
    ownerName: 'Ben Carter',
    details: 'Rediseño completo del sitio web corporativo, incluyendo nueva arquitectura de información y experiencia de usuario.'
  },
  {
    id: 'opp-3',
    title: 'Renovación de Suscripción Anual',
    clientName: 'Quantum Leap Tech',
    clientId: 'client-3',
    value: 45000,
    stage: 'Cerrado - Ganado',
    closeDate: '2024-07-20',
    ownerId: 'user-1',
    ownerName: 'Alex Morgan',
    details: 'Renovación del servicio de software cloud por un año más.'
  },
  {
    id: 'opp-4',
    title: 'Anuncio de Lanzamiento de Nuevo Producto',
    clientName: 'Starlight Productions',
    clientId: 'client-4',
    value: 95000,
    stage: 'Nuevo',
    closeDate: '2024-09-30',
    ownerId: 'user-3',
    ownerName: 'Chloe Davis',
    details: 'Campaña publicitaria para el lanzamiento de un nuevo producto, incluye TV y medios digitales.'
  },
  {
    id: 'opp-5',
    title: 'Estrategia de SEO y Contenido',
    clientName: 'Apex Digital',
    clientId: 'client-5',
    value: 30000,
    stage: 'Propuesta',
    closeDate: '2024-08-25',
    ownerId: 'user-2',
    ownerName: 'Ben Carter',
  },
  {
    id: 'opp-6',
    title: 'Gestión de Redes Sociales',
    clientName: 'Global Media Inc.',
    clientId: 'client-1',
    value: 25000,
    stage: 'Nuevo',
    closeDate: '2024-10-10',
    ownerId: 'user-1',
    ownerName: 'Alex Morgan',
  },
  {
    id: 'opp-7',
    title: 'Desarrollo de App Móvil',
    clientName: 'Quantum Leap Tech',
    clientId: 'client-3',
    value: 250000,
    stage: 'Cerrado - Perdido',
    closeDate: '2024-07-10',
    ownerId: 'user-3',
    ownerName: 'Chloe Davis',
  },
];

    