'use client';

import React from 'react';
import type { CommercialNote, Program } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotePdfProps {
  note: Partial<CommercialNote>;
  programs: Program[];
}

const SectionTitle = ({ title }: { title: string }) => (
    <div className="bg-gray-200 p-2 font-bold uppercase mb-2 text-sm border-b-2 border-red-600 print:bg-gray-200 print:text-black">
        {title}
    </div>
);

const Field = ({ label, value }: { label: string, value?: string | number | null }) => (
    <div className="mb-2">
        <span className="font-bold text-sm">{label}: </span>
        <span className="text-sm break-words">{value || '-'}</span>
    </div>
);

export const NotePdf = React.forwardRef<HTMLDivElement, NotePdfProps>(({ note, programs }, ref) => {
    return (
      <div ref={ref} className="bg-white p-8" style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, sans-serif' }}>
        <header className="flex justify-between items-center mb-8 border-b pb-4">
            {/* Usamos img normal para evitar problemas de CORS/Loading con html2canvas */}
            <img 
                src="/aire-logo-red.png" 
                alt="AIRE Logo" 
                style={{ width: '120px', height: 'auto', objectFit: 'contain' }} 
            />
            <div className="text-right">
                <h1 className="text-xl font-bold text-red-600">NOTA COMERCIAL</h1>
                <p className="text-sm text-gray-500">{format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}</p>
                <p className="text-sm font-semibold">Asesor: {note.advisorName}</p>
            </div>
        </header>

        <main className="grid grid-cols-2 gap-8">
            {/* Columna Izquierda */}
            <div className="flex flex-col gap-6">
                <div>
                    <SectionTitle title="Datos del Cliente" />
                    <Field label="Cliente" value={note.clientName} />
                    <Field label="Razón Social" value={note.razonSocial} />
                    <Field label="CUIT" value={note.cuit} />
                    <Field label="Rubro" value={note.rubro} />
                </div>

                <div>
                    <SectionTitle title="Detalles de la Nota" />
                    <Field label="Título" value={note.title} />
                    <Field label="Ubicación" value={note.location} />
                    {note.location === 'Llamada' && <Field label="Teléfono Llamada" value={note.callPhone} />}
                    
                    <div className="mt-2 p-2 border border-gray-200 rounded bg-gray-50">
                        <p className="text-xs font-bold text-gray-600 uppercase">GRAF PRIMARIO</p>
                        <p className="text-sm font-medium">{note.primaryGraf}</p>
                    </div>
                    <div className="mt-2 p-2 border border-gray-200 rounded bg-gray-50">
                        <p className="text-xs font-bold text-gray-600 uppercase">GRAF SECUNDARIO</p>
                        <p className="text-sm font-medium">{note.secondaryGraf}</p>
                    </div>
                </div>

                <div>
                    <SectionTitle title="Entrevistado" />
                    <Field label="Nombre" value={note.intervieweeName} />
                    <Field label="Cargo" value={note.intervieweeRole} />
                    {note.intervieweeBio && (
                        <div className="mt-2">
                            <span className="font-bold text-sm">Bio:</span>
                            <p className="text-xs italic mt-1 text-gray-600">{note.intervieweeBio}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Columna Derecha */}
            <div className="flex flex-col gap-6">
                <div>
                    <SectionTitle title="Producción y Pautado" />
                    <Field label="Coordinación (Cliente)" value={note.contactName} />
                    <Field label="Teléfono Coord." value={note.contactPhone} />
                    
                    <div className="mt-4">
                        <span className="font-bold text-sm block mb-1">Cronograma:</span>
                        <ul className="text-xs space-y-1">
                            {Object.entries(note.schedule || {}).map(([progId, items]) => {
                                const progName = programs.find(p => p.id === progId)?.name || 'Programa';
                                // @ts-ignore
                                const formattedItems = Array.isArray(items) ? items : [];
                                if (formattedItems.length === 0) return null;
                                
                                return (
                                    <li key={progId} className="border-l-2 border-red-500 pl-2 mb-1">
                                        <strong>{progName}:</strong><br/>
                                        {/* @ts-ignore */}
                                        {formattedItems.map(i => `${format(new Date(i.date), 'dd/MM')} ${i.time ? `(${i.time}hs)` : ''}`).join(', ')}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className="mt-4 flex flex-col gap-1 text-xs">
                        <div>
                            <span className="font-bold">Replica Web:</span> {note.replicateWeb ? 'SÍ' : 'NO'}
                        </div>
                        <div>
                            <span className="font-bold">Replica Redes:</span> {note.replicateSocials && note.replicateSocials.length > 0 ? note.replicateSocials.join(', ') : 'Ninguna'}
                        </div>
                    </div>
                </div>

                <div>
                    <SectionTitle title="Canales de Contacto" />
                    {!note.noWeb && <Field label="Web" value={note.website} />}
                    {!note.noWhatsapp && <Field label="WhatsApp" value={note.whatsapp} />}
                    {!note.noCommercialPhone && <Field label="Tel. Comercial" value={note.phone} />}
                    {note.instagram && <Field label="Instagram" value={note.instagram} />}
                </div>

                <div>
                    <SectionTitle title="Preguntas Sugeridas" />
                    <ul className="list-decimal list-inside text-sm space-y-1">
                        {note.questions?.map((q, i) => (
                            <li key={i} className="pl-1">{q}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </main>

        <footer className="mt-8 pt-4 border-t-2 border-gray-800 text-xs text-gray-500">
            <div className="mb-2">
                <span className="font-bold">Observaciones Generales:</span>
                <p className="mt-1">{note.noteObservations || 'Sin observaciones.'}</p>
            </div>
            {note.graphicSupport && (
                <div className="mt-4 p-2 bg-yellow-100 border border-yellow-300 text-yellow-800 font-bold text-center rounded">
                    REQUIERE SOPORTE GRÁFICO {note.graphicSupportLink ? `(Link adjunto)` : ''}
                </div>
            )}
        </footer>
      </div>
    );
});

NotePdf.displayName = 'NotePdf';
