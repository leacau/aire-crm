'use client';

import React from 'react';
import type { CommercialNote, Program } from '@/lib/types';
import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotePdfProps {
  note: Partial<CommercialNote>;
  programs: Program[];
}

const SectionTitle = ({ title }: { title: string }) => (
    <div className="bg-gray-200 p-2 font-bold uppercase mb-2 text-sm border-b-2 border-red-600">
        {title}
    </div>
);

const Field = ({ label, value }: { label: string, value?: string | number | null }) => (
    <div className="mb-2">
        <span className="font-bold text-sm">{label}: </span>
        <span className="text-sm">{value || '-'}</span>
    </div>
);

export const NotePdf = React.forwardRef<HTMLDivElement, NotePdfProps>(({ note, programs }, ref) => {
    return (
      <div ref={ref} className="bg-white p-8" style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>
        <header className="flex justify-between items-center mb-8 border-b pb-4">
            <Image src="/aire-logo-red.png" alt="AIRE Logo" width={120} height={50} style={{ objectFit: 'contain' }} />
            <div className="text-right">
                <h1 className="text-xl font-bold">NOTA COMERCIAL</h1>
                <p className="text-sm text-gray-500">{format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}</p>
                <p className="text-sm font-semibold">Asesor: {note.advisorName}</p>
            </div>
        </header>

        <main className="grid grid-cols-2 gap-8">
            {/* Columna Izquierda */}
            <div>
                <SectionTitle title="Datos del Cliente" />
                <Field label="Cliente" value={note.clientName} />
                <Field label="Razón Social" value={note.razonSocial} />
                <Field label="CUIT" value={note.cuit} />
                <Field label="Rubro" value={note.rubro} />

                <div className="mt-6">
                    <SectionTitle title="Detalles de la Nota" />
                    <Field label="Título" value={note.title} />
                    <Field label="Ubicación" value={note.location} />
                    {note.location === 'Llamada' && <Field label="Teléfono Llamada" value={note.callPhone} />}
                    
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                        <p className="text-xs font-bold text-gray-600">GRAF PRIMARIO</p>
                        <p className="text-sm">{note.primaryGraf}</p>
                    </div>
                    <div className="mt-2 p-2 bg-gray-50 rounded">
                        <p className="text-xs font-bold text-gray-600">GRAF SECUNDARIO</p>
                        <p className="text-sm">{note.secondaryGraf}</p>
                    </div>
                </div>

                <div className="mt-6">
                    <SectionTitle title="Entrevistado" />
                    <Field label="Nombre" value={note.intervieweeName} />
                    <Field label="Cargo" value={note.intervieweeRole} />
                    {note.intervieweeBio && (
                        <div className="mt-2">
                            <span className="font-bold text-sm">Bio:</span>
                            <p className="text-xs italic mt-1">{note.intervieweeBio}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Columna Derecha */}
            <div>
                <SectionTitle title="Producción y Pautado" />
                <Field label="Coordinación (Cliente)" value={note.contactName} />
                <Field label="Teléfono Coord." value={note.contactPhone} />
                
                <div className="mt-4">
                    <span className="font-bold text-sm block mb-1">Cronograma:</span>
                    <ul className="text-xs space-y-1">
                        {Object.entries(note.schedule || {}).map(([progId, items]) => {
                            const progName = programs.find(p => p.id === progId)?.name || 'Programa';
                            return (
                                <li key={progId} className="border-l-2 border-red-500 pl-2">
                                    <strong>{progName}:</strong> {items.map(i => `${format(new Date(i.date), 'dd/MM')} ${i.time ? `(${i.time}hs)` : ''}`).join(', ')}
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="mt-4 flex gap-4 text-xs">
                    <div>
                        <span className="font-bold">Web:</span> {note.replicateWeb ? 'SÍ' : 'NO'}
                    </div>
                    <div>
                        <span className="font-bold">Redes:</span> {note.replicateSocials?.join(', ') || '-'}
                    </div>
                </div>

                <div className="mt-6">
                    <SectionTitle title="Canales de Contacto" />
                    {!note.noWeb && <Field label="Web" value={note.website} />}
                    {!note.noWhatsapp && <Field label="WhatsApp" value={note.whatsapp} />}
                    {!note.noCommercialPhone && <Field label="Tel. Comercial" value={note.phone} />}
                    {note.instagram && <Field label="Instagram" value={note.instagram} />}
                </div>

                <div className="mt-6">
                    <SectionTitle title="Preguntas Sugeridas" />
                    <ul className="list-disc list-inside text-sm">
                        {note.questions?.map((q, i) => (
                            <li key={i}>{q}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </main>

        <footer className="mt-8 pt-4 border-t text-xs text-gray-500">
            <p>Observaciones Generales: {note.noteObservations || '-'}</p>
            {note.graphicSupport && <p className="mt-1 font-bold text-red-600">REQUIERE SOPORTE GRÁFICO</p>}
        </footer>
      </div>
    );
});

NotePdf.displayName = 'NotePdf';
