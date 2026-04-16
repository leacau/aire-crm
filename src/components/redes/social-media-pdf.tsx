'use client';

import React from 'react';
import type { SocialMediaRequest } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface SocialMediaPdfProps {
  request: Partial<SocialMediaRequest>;
}

const SectionTitle = ({ title }: { title: string }) => (
    <div className="bg-gray-200 p-2 font-bold uppercase mb-2 text-sm border-b-2 border-red-600 w-full mt-4">
        {title}
    </div>
);

const Field = ({ label, value, fullWidth = false }: { label: string, value?: string | number | null | boolean, fullWidth?: boolean }) => {
    let displayValue = value;
    if (typeof value === 'boolean') {
        displayValue = value ? 'SÍ' : 'NO';
    }
    
    const isUrl = typeof value === 'string' && (value.startsWith('http') || value.startsWith('www.'));
    const finalDisplayValue = isUrl ? (value.startsWith('http') ? value : `https://${value}`) : displayValue;

    return (
        <div className={`mb-2 ${fullWidth ? 'w-full' : ''}`}>
            <span className="font-bold text-sm">{label}: </span>
            {isUrl ? (
                <a 
                    href={finalDisplayValue as string} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-700 underline font-bold"
                    style={{ display: 'inline-block', padding: '2px 8px', backgroundColor: '#eff6ff', borderRadius: '4px', border: '1px solid #bfdbfe' }}
                >
                    👉 ABRIR ENLACE 👈
                </a>
            ) : (
                <span className="text-sm break-words whitespace-pre-wrap">{finalDisplayValue || '-'}</span>
            )}
        </div>
    );
};

export const SocialMediaPdf = React.forwardRef<HTMLDivElement, SocialMediaPdfProps>(({ request }, ref) => {
    
    const pageStyle: React.CSSProperties = {
        width: '210mm',
        minHeight: '297mm',
        padding: '20mm',
        backgroundColor: 'white',
        fontFamily: 'Arial, sans-serif',
        position: 'relative',
        boxSizing: 'border-box'
    };
  
    return (
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
        
        {/* --- PÁGINA 1 --- */}
        <div id="social-pdf-page-1" style={pageStyle}>
            <header className="flex justify-between items-center mb-6 border-b pb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.webp" alt="AIRE Logo" style={{ width: '120px', height: 'auto' }} />
                <div className="text-right">
                    <h1 className="text-2xl font-bold text-red-600">PEDIDO DE REDES</h1>
                    <p className="text-sm text-gray-500">{format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}</p>
                    <p className="text-sm font-semibold">Ejecutivo: {request.advisorName}</p>
                </div>
            </header>

            <div className="flex flex-col gap-2">
                <SectionTitle title="1. Datos Generales" />
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Cliente" value={request.clientName} />
                    <Field label="Contacto Coordinación" value={request.contactName} />
                    <Field label="Tipo de Contenido" value={request.contentType} />
                    <Field label="Realizador" value={request.creator} />
                </div>

                <SectionTitle title="2. Fechas y Ubicación" />
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Lugar de Grabación" value={request.recordingLocation} />
                    <Field label="Fecha Grabación" value={request.recordingDate ? format(parseISO(request.recordingDate), 'dd/MM/yyyy') : '-'} />
                    <Field label="Hora Grabación" value={request.recordingTime ? `${request.recordingTime} hs` : '-'} />
                    <Field label="Fecha Publicación" value={request.publishDate ? format(parseISO(request.publishDate), 'dd/MM/yyyy') : '-'} />
                </div>
                {request.materialUrl && <Field label="Link a Materiales" value={request.materialUrl} fullWidth />}
                <Field label="¿Requiere validación del cliente antes de publicar?" value={request.clientValidation} />

                {request.contentType === 'Story' && (
                    <>
                        <SectionTitle title="3. Detalles de la Story" />
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="¿Es réplica de nota web?" value={request.isWebReplication} />
                            <Field label="Etiqueta visible al cliente" value={request.storyTagClient} />
                            {request.storyTagClient && <Field label="Cuenta a etiquetar" value={request.storyTagHandle} />}
                        </div>
                        {request.storyUrl && <Field label="URL / Link" value={request.storyUrl} fullWidth />}
                        {request.storyCta && <Field label="Llamado a la acción (CTA)" value={request.storyCta} fullWidth />}
                    </>
                )}

                {request.contentType === 'Reel' && (
                    <>
                        <SectionTitle title="3. Detalles del Reel" />
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="¿Va colaborado?" value={request.reelCollaboration} />
                            {request.reelCollaboration && <Field label="Cuenta a colaborar" value={request.reelCollabHandle} />}
                        </div>
                        {request.reelCopy && (
                            <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded">
                                <span className="font-bold text-sm block mb-1">Copy / Texto estimado:</span>
                                <p className="text-sm whitespace-pre-wrap">{request.reelCopy}</p>
                            </div>
                        )}
                    </>
                )}

               {request.contentType === 'Carrusel' && (
                    <>
                        <SectionTitle title={`3. Slides del Carrusel (${request.carouselSlides?.length || 0})`} />
                        <div className="grid grid-cols-2 gap-4 mb-2">
                            <Field label="¿Va colaborado?" value={request.reelCollaboration} />
                            {request.reelCollaboration && <Field label="Cuenta a colaborar" value={request.reelCollabHandle} />}
                        </div>
                        
                        {request.carouselSlides && request.carouselSlides.map((slide, i) => (
                            <div key={i} className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded">
                                <span className="font-bold text-sm block text-purple-900 mb-1">Slide #{i + 1}</span>
                                {slide.text && <p className="text-sm whitespace-pre-wrap mb-2">{slide.text}</p>}
                                {slide.link && (
                                    <a href={slide.link.startsWith('http') ? slide.link : `https://${slide.link}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-bold text-xs">
                                        👉 Enlace a material
                                    </a>
                                )}
                            </div>
                        ))}
                    </>
                )}
            </div>
            
            <div className="absolute bottom-8 right-8 text-xs text-gray-400">Página 1 de 2</div>
        </div>

        {/* --- PÁGINA 2 --- */}
        <div id="social-pdf-page-2" style={pageStyle}>
            <header className="flex justify-between items-center mb-6 border-b pb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.webp" alt="AIRE Logo" style={{ width: '80px', height: 'auto', opacity: 0.7 }} />
                <div className="text-right">
                    <h2 className="text-lg font-bold text-gray-600">PEDIDO DE REDES - Cont.</h2>
                    <p className="text-xs text-gray-400">Cliente: {request.clientName}</p>
                </div>
            </header>

            <div className="flex flex-col gap-2">
                <SectionTitle title="4. Contenido Estratégico" />
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded">
                    <span className="font-bold text-sm block mb-1">Objetivo del contenido:</span>
                    <p className="text-sm whitespace-pre-wrap italic text-gray-700">{request.objective}</p>
                </div>
                <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded">
                    <span className="font-bold text-sm block mb-1">Guion / Idea:</span>
                    <p className="text-sm whitespace-pre-wrap">{request.script}</p>
                </div>

                {request.observations && (
                    <>
                        <SectionTitle title="5. Observaciones Adicionales" />
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm whitespace-pre-wrap">{request.observations}</p>
                        </div>
                    </>
                )}
            </div>

            <div className="absolute bottom-8 right-8 text-xs text-gray-400">Página 2 de 2</div>
        </div>

      </div>
    );
});

SocialMediaPdf.displayName = 'SocialMediaPdf';
