import type { User, Client, Opportunity, OpportunityStage, Activity, Person } from './types';

export const users: User[] = [
  { id: 'user-1', name: 'Alex Morgan', email: 'alex.morgan@example.com', avatarUrl: 'https://picsum.photos/seed/user1/40/40', initials: 'AM', role: 'Asesor' },
  { id: 'user-2', name: 'Ben Carter', email: 'ben.carter@example.com', avatarUrl: 'https://picsum.photos/seed/user2/40/40', initials: 'BC', role: 'Asesor' },
  { id: 'user-3', name: 'Chloe Davis', email: 'chloe.davis@example.com', avatarUrl: 'https://picsum.photos/seed/user3/40/40', initials: 'CD', role: 'Jefe' },
  { id: 'user-4', name: 'David Evans', email: 'david.evans@example.com', avatarUrl: 'https://picsum.photos/seed/user4/40/40', initials: 'DE', role: 'Administracion' },
];

export const people: Person[] = [
    { id: 'person-1', name: 'Juan Perez', email: 'juan.perez@globalmedia.com', phone: '555-1111', clientIds: ['client-1'] },
    { id: 'person-2', name: 'Maria Rodriguez', email: 'maria.r@innovatesolutions.io', phone: '555-2222', clientIds: ['client-2'] },
    { id: 'person-3', name: 'Carlos Gomez', email: 'carlos.gomez@quantumleap.tech', phone: '555-3333', clientIds: ['client-3'] },
    { id: 'person-4', name: 'Ana Martinez', phone: '555-4444', clientIds: ['client-4', 'client-1'] },
    { id: 'person-5', name: 'Lucia Fernandez', email: 'lucia.f@apexdigital.com', phone: '555-5555', clientIds: ['client-5'] },
];

// This is now just initial mock data. The app will use Firestore.
export let clients: Client[] = [
  {
    id: 'client-1',
    name: 'Global Media Inc.',
    email: 'contact@globalmedia.com',
    phone: '555-0101',
    company: 'Global Media Inc.',
    avatarUrl: 'https://picsum.photos/seed/client1/40/40',
    avatarFallback: 'GM',
    personIds: ['person-1', 'person-4'],
    ownerId: 'user-1',
  },
  {
    id: 'client-2',
    name: 'Innovate Solutions',
    email: 'hello@innovatesolutions.io',
    phone: '555-0102',
    company: 'Innovate Solutions',
    avatarUrl: 'https://picsum.photos/seed/client2/40/40',
    avatarFallback: 'IS',
    personIds: ['person-2'],
    ownerId: 'user-2',
  },
];

export const opportunityStages: OpportunityStage[] = [
  'Nuevo',
  'Propuesta',
  'Negociación',
  'Cerrado - Ganado',
  'Cerrado - Perdido',
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
  },
];

export let activities: Activity[] = [
  {
    id: 'act-1',
    type: 'Reunión',
    subject: 'Llamada inicial de descubrimiento',
    date: '2024-07-12',
    notes: 'Se discutió el alcance y los objetivos del proyecto. El cliente está interesado en una propuesta completa.',
    clientId: 'client-4',
    opportunityId: 'opp-4',
  },
  {
    id: 'act-2',
    type: 'Email',
    subject: 'Seguimiento de la propuesta',
    date: '2024-07-28',
    notes: 'Se envió la propuesta revisada con los precios actualizados. A la espera de comentarios.',
    clientId: 'client-2',
    opportunityId: 'opp-2',
  },
  {
    id: 'act-3',
    type: 'Llamada',
    subject: 'Llamada de negociación del contrato',
    date: '2024-08-02',
    notes: 'Se discutieron los términos finales del contrato. Se solicitaron ajustes menores en el calendario de pagos.',
    clientId: 'client-1',
    opportunityId: 'opp-1',
  },
  {
    id: 'act-4',
    type: 'Nota',
    subject: 'Reunión de estrategia interna',
    date: '2024-08-01',
    notes: 'Reunión de equipo para alinear la estrategia de entrega para el proyecto de SEO.',
    clientId: 'client-5',
    opportunityId: 'opp-5',
  },
    {
    id: 'act-5',
    type: 'Email',
    subject: 'Bienvenida e incorporación',
    date: '2024-07-21',
    notes: 'Se envió un correo electrónico de bienvenida y materiales de incorporación después de ganar el trato.',
    clientId: 'client-3',
    opportunityId: 'opp-3',
  },
];

export const recentActivities = activities.slice(0, 3);
