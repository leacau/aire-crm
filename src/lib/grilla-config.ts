import type { Program } from './types';

// Configuración inicial de los programas de la radio.
// Puedes modificar, añadir o eliminar programas aquí.
// daysOfWeek: 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado

export const programs: Program[] = [
  {
    id: 'ahora-vengo',
    name: 'Ahora Vengo',
    startTime: '09:00',
    endTime: '12:00',
    daysOfWeek: [1, 2, 3, 4, 5], // Lunes a Viernes
    color: 'bg-blue-100',
  },
  {
    id: 'pasan-cosas',
    name: 'Pasan Cosas',
    startTime: '16:00',
    endTime: '18:00',
    daysOfWeek: [1, 2, 3, 4, 5], // Lunes a Viernes
    color: 'bg-red-100',
  },
  {
    id: 'creo',
    name: 'Creo',
    startTime: '18:00',
    endTime: '20:00',
    daysOfWeek: [1, 2, 3, 4, 5], // Lunes a Viernes
    color: 'bg-green-100',
  },
  {
    id: 'finde-aire',
    name: 'Finde en Aire',
    startTime: '10:00',
    endTime: '13:00',
    daysOfWeek: [6, 0], // Sábado y Domingo
    color: 'bg-purple-100',
  },
];
