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
    <div className="bg-gray-200 p-2 font-bold uppercase mb-2 text-sm border-b-2 border-red-600 w-full">
        {title}
    </div>
);

const Field = ({ label, value, fullWidth = false }: { label: string, value?: string | number | null, fullWidth?: boolean }) => {
    // Detectamos si el valor es una URL
    const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('www.'));
    const displayValue = isUrl ? (value.startsWith('http') ? value : `https://${value}`) : value;

    return (
        <div className={`mb-2 ${fullWidth ? 'w-full' : ''}`}>
            <span className="font-bold text-sm">{label}: </span>
            <span className="text-sm break-words whitespace-pre-wrap">
                {isUrl ? (
                    <a 
                        href={displayValue as string} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-red-600 underline font-bold"
                        style={{ display: 'inline-block', minWidth: '10px' }} // Asegura área de clic
                    >
                        VER CONTENIDO
                    </a>
                ) : (
                    value || '-'
                )}
            </span>
        </div>
    );
};

export const NotePdf = React.forwardRef<HTMLDivElement, NotePdfProps>(({ note, programs }, ref) => {
    
    const pageStyle: React.CSSProperties = {
        width: '210mm',
        minHeight: '297mm',
        padding: '20mm',
        backgroundColor: 'white',
        fontFamily: 'Arial, sans-serif',
        position: 'relative',
        boxSizing: 'border-box'
    };
  
    // Helper para obtener arrays (legacy compatibility)
    const pGrafs = note.primaryGrafs && note.primaryGrafs.length > 0 ? note.primaryGrafs : (note.primaryGraf ? [note.primaryGraf] : []);
    const sGrafs = note.secondaryGrafs && note.secondaryGrafs.length > 0 ? note.secondaryGrafs : (note.secondaryGraf ? [note.secondaryGraf] : []);
  
    return (
      <div ref={ref}>
        
        <div id="note-pdf-page-1" style={pageStyle}>
            <header className="flex justify-between items-center mb-6 border-b pb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.webp" alt="AIRE Logo" style={{ width: '120px', height: 'auto' }} />
                <div className="text-right">
                    <h1 className="text-2xl font-bold text-red-600">NOTA COMERCIAL</h1>
                    <p className="text-sm text-gray-500">{format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}</p>
                    <p className="text-sm font-semibold">Asesor: {note.advisorName}</p>
                </div>
            </header>

            <div className="flex flex-col gap-6">
                
                <div className="w-full">
                    <SectionTitle title="1. Detalles de la Nota" />
                    <Field label="Título" value={note.title} fullWidth />
                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <Field label="Ubicación" value={note.location} />
                        {note.location === 'Llamada' && <Field label="Teléfono Llamada" value={note.callPhone} />}
                        {note.location === 'Móvil' && <Field label="Dirección Móvil" value={note.mobileAddress} />}
                    </div>
                    
                    <div className="mt-3 space-y-3">
                        {pGrafs.map((g, i) => (
                            <div key={`p-${i}`} className="p-3 border border-gray-300 rounded bg-gray-50">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">TITULAR.Text (Max 84)</p>
                                <p className="text-base font-medium uppercase">{g}</p>
                            </div>
                        ))}
                        {sGrafs.map((g, i) => (
                            <div key={`s-${i}`} className="p-3 border border-gray-300 rounded bg-gray-50">
                                <p className="text-xs font-bold text-gray-500 uppercase mb-1">NOMBRE/FUNCION.Text (Max 55)</p>
                                <p className="text-base font-medium uppercase">{g}</p>
                            </div>
                        ))}
                    </div>

                   {note.graphicSupport && (
                      <div className="mt-4 p-2 bg-yellow-100 border border-yellow-300 text-yellow-800 font-bold text-center rounded">
                          ⚠️ REQUIERE SOPORTE GRÁFICO 
                          {note.graphicSupportLink && (
                             </br> <a 
                                  href={note.graphicSupportLink.startsWith('http') ? note.graphicSupportLink : `https://${note.graphicSupportLink}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="ml-2 underline text-red-700 inline-block px-1"
                                  style={{ cursor: 'pointer' }}
                              >
                                 👉 Ver contenido 👈
                              </a>
                          )}
                      </div>
                    )}
                </div>

                <div className="w-full">
                    <SectionTitle title="2. Datos del Cliente" />
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Cliente" value={note.clientName} />
                        <Field label="Razón Social" value={note.razonSocial} />
                        <Field label="CUIT" value={note.cuit} />
                        <Field label="Rubro" value={note.rubro} />
                    </div>
                </div>

                <div className="w-full">
                    <SectionTitle title="3. Producción y Pautado" />
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <Field label="Coordinación (Cliente)" value={note.contactName} />
                        <Field label="Teléfono Coord." value={note.contactPhone} />
                    </div>
                    
                    <div className="mb-4 bg-gray-50 p-3 rounded border border-gray-200">
                        <span className="font-bold text-sm block mb-2 underline">Cronograma / Salidas:</span>
                        <ul className="text-sm space-y-2">
                            {Object.entries(note.schedule || {}).map(([progId, items]) => {
                                const progName = programs.find(p => p.id === progId)?.name || 'Programa';
                                // @ts-ignore
                                const formattedItems = Array.isArray(items) ? items : [];
                                if (formattedItems.length === 0) return null;
                                return (
                                    <li key={progId} className="border-l-4 border-red-500 pl-3">
                                        <strong className="text-red-700">{progName}</strong>
                                        <div className="text-gray-700 mt-1">
                                            {/* @ts-ignore */}
                                            {formattedItems.map(i => `${format(new Date(i.date), 'dd/MM/yyyy')} a las ${i.time ? i.time : '??:??'}hs`).join(' | ')}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className="flex flex-col gap-2 text-sm border-t pt-2">
                        <div className="flex gap-8">
                            <div><span className="font-bold">Replica Web:</span> {note.replicateWeb ? 'SÍ' : 'NO'}</div>
                            <div><span className="font-bold">Replica Redes:</span> {note.replicateSocials && note.replicateSocials.length > 0 ? note.replicateSocials.join(', ') : 'Ninguna'}</div>
                        </div>
                        {note.replicateSocials && note.replicateSocials.length > 0 && (
                            <div className="bg-blue-50 p-2 rounded border border-blue-100 mt-1">
                                <div className="grid grid-cols-2 gap-2">
                                    <div><span className="font-bold">Colaboración:</span> {note.collaboration ? `SÍ (${note.collaborationHandle})` : 'NO'}</div>
                                    <div><span className="font-bold">CTA:</span> {note.ctaText || '-'} &rarr; {note.ctaDestination || '-'}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="absolute bottom-8 right-8 text-xs text-gray-400">Página 1 de 2</div>
        </div>

        {/* --- PÁGINA 2 --- */}
        <div id="note-pdf-page-2" style={pageStyle}>
            <header className="flex justify-between items-center mb-6 border-b pb-4">
                 {/* eslint-disable-next-line @next/next/no-img-element */}
                 <img src="/logo.webp" alt="AIRE Logo" style={{ width: '80px', height: 'auto', opacity: 0.7 }} />
                 <div className="text-right">
                    <h2 className="text-lg font-bold text-gray-600">NOTA COMERCIAL - Continuación</h2>
                    <p className="text-xs text-gray-400">Título: {note.title}</p>
                </div>
            </header>

            <div className="flex flex-col gap-6">
                
                <div className="w-full">
                    <SectionTitle title="4. Entrevistado" />
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Nombre" value={note.intervieweeName} />
                        <Field label="Cargo" value={note.intervieweeRole} />
                    </div>
                    {note.intervieweeBio && (
                        <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-100">
                            <span className="font-bold text-sm block">Bio / Info Adicional:</span>
                            <p className="text-sm italic mt-1 text-gray-700">{note.intervieweeBio}</p>
                        </div>
                    )}
                </div>

                <div className="w-full">
                    <SectionTitle title="5. Canales de Contacto (A mostrar)" />
                    <div className="grid grid-cols-2 gap-y-2 gap-x-8 mb-3">
                        {!note.noWeb && <Field label="Web" value={note.website} />}
                        {!note.noWhatsapp && <Field label="WhatsApp" value={note.whatsapp} />}
                        {!note.noCommercialPhone && <Field label="Tel. Comercial" value={note.phone} />}
                        {note.instagram && <Field label="Instagram" value={note.instagram} />}
                    </div>
                    
                    {!note.noCommercialAddress && note.commercialAddresses && note.commercialAddresses.length > 0 && (
                        <div className="mt-2 border-t pt-2">
                            <span className="font-bold text-sm block mb-1">Domicilio(s) Comercial(es):</span>
                            <ul className="list-disc list-inside text-sm pl-2">
                                {note.commercialAddresses.map((addr, i) => (
                                    <li key={i}>{addr}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {(note.noWeb && note.noWhatsapp && note.noCommercialPhone && !note.instagram && note.noCommercialAddress) && (
                        <p className="text-sm text-gray-500 italic">No se mostrarán canales de contacto.</p>
                    )}
                </div>

                <div className="w-full">
                    <SectionTitle title="6. Contenido" />
                    
                    <div className="mb-4">
                        <span className="font-bold text-sm block mb-2 underline">Preguntas Sugeridas:</span>
                        <ul className="list-decimal list-inside text-sm space-y-2">
                            {note.questions?.map((q, i) => (
                                <li key={i} className="pl-2 py-1 border-b border-gray-100 last:border-0">{q}</li>
                            ))}
                        </ul>
                    </div>

                    {note.topicsToAvoid && note.topicsToAvoid.length > 0 && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded">
                            <span className="font-bold text-sm block mb-2 text-red-700 underline">⚠️ TEMAS A EVITAR:</span>
                            <ul className="list-disc list-inside text-sm space-y-1 text-red-900">
                                {note.topicsToAvoid.map((t, i) => (
                                    <li key={i}>{t}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="w-full">
                    <SectionTitle title="7. Observaciones Generales" />
                    <div className="p-4 border border-gray-200 rounded min-h-[100px] bg-yellow-50/30">
                        <p className="text-sm whitespace-pre-wrap">{note.noteObservations || 'Sin observaciones adicionales.'}</p>
                    </div>
                </div>
            </div>
            <div className="absolute bottom-8 right-8 text-xs text-gray-400">Página 2 de 2</div>
        </div>
      </div>
    );
});

NotePdf.displayName = 'NotePdf';
