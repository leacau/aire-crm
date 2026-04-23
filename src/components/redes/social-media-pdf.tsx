'use client';

import React from 'react';
import type { SocialMediaRequest } from '@/lib/types';
import { format, parseISO } from 'date-fns';

interface SocialMediaPdfProps {
  request: Partial<SocialMediaRequest>;
}

const SectionTitle = ({ title }: { title: string }) => (
    <div className="bg-gray-200 p-2 font-bold uppercase mb-2 text-sm border-b-2 border-red-600 w-full">
        {title}
    </div>
);

const Field = ({ label, value, fullWidth = false }: { label: string, value?: string | number | boolean | null, fullWidth?: boolean }) => {
    const displayValue = typeof value === 'boolean' ? (value ? 'SÍ' : 'NO') : (value || '-');
    const isUrl = typeof value === 'string' && value.startsWith('http');

    return (
        <div className={`mb-3 ${fullWidth ? 'w-full' : ''}`}>
            <span className="font-bold text-sm block mb-1 text-gray-700">{label}:</span>
            {isUrl ? (
                <a href={value as string} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline text-sm font-semibold bg-blue-50 px-2 py-1 rounded inline-block">
                    Abrir Enlace
                </a>
            ) : (
                <div className="text-sm bg-gray-50 p-2 rounded border border-gray-100 whitespace-pre-wrap">{displayValue}</div>
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
      <div ref={ref}>
        
        {/* --- PÁGINA 1 --- */}
        <div id="social-pdf-page-1" style={pageStyle}>
            <header className="flex justify-between items-center mb-6 border-b pb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.webp" alt="AIRE Logo" style={{ width: '120px', height: 'auto' }} />
                <div className="text-right">
                    <h1 className="text-xl font-bold text-red-600 uppercase">Pedido: {request.contentType}</h1>
                    <p className="text-sm font-semibold">Asesor: {request.advisorName}</p>
                </div>
            </header>

            <div className="flex flex-col gap-6">
                
                <div className="w-full">
                    <SectionTitle title="1. Detalles del Pedido" />
                    <Field label="Cliente" value={request.clientName} fullWidth />
                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <Field label="Contacto Coordinación" value={request.contactName} />
                        {/* 🟢 CONDICIONAL: Solo mostrar datos de grabación si es Reel */}
                        {request.contentType === 'Reel' && (
                            <>
                                <Field label="Lugar de Grabación" value={request.recordingLocation} />
                                <Field label="Fecha Grabación" value={request.recordingDate ? format(parseISO(request.recordingDate), 'dd/MM/yyyy') : '-'} />
                                <Field label="Hora" value={request.recordingTime} />
                            </>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 p-3 bg-gray-100 rounded">
                        <Field label="Formato" value={request.contentType} />
                        <Field label="Creador" value={request.creator} />
                        <Field label="Validación" value={request.clientValidation ? 'SÍ' : 'NO'} />
                    </div>
                </div>

                <div className="w-full">
                    <SectionTitle title="2. Contenido y Objetivos" />
                    <Field label="Objetivo" value={request.objective} fullWidth />
                    <Field label="Guion estimativo / Idea" value={request.script} fullWidth />
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Fecha Pub. Sugerida" value={request.publishDate ? format(parseISO(request.publishDate), 'dd/MM/yyyy') : '-'} />
                        {request.materialUrl && <Field label="Material de Apoyo" value={request.materialUrl} />}
                    </div>
                </div>

                <div className="w-full">
                    <SectionTitle title="3. Especificaciones del Formato" />
                    
                    {request.contentType === 'Story' && (
                        <div className="mt-2 p-3 bg-orange-50 border border-orange-200 rounded">
                            <h3 className="font-bold text-orange-800 mb-2">Detalles de Story</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Réplica Web" value={request.isWebReplication} />
                                {request.storyTagClient && <Field label="Etiqueta Cliente" value={request.storyTagHandle || 'SÍ'} />}
                            </div>
                            {request.storyUrl && <Field label="URL a enlazar" value={request.storyUrl} fullWidth />}
                            {request.storyCta && <Field label="Texto CTA" value={request.storyCta} fullWidth />}
                        </div>
                    )}

                    {request.contentType === 'Reel' && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
                            <h3 className="font-bold text-blue-800 mb-2">Detalles del Reel</h3>
                            <Field label="Copy de la publicación" value={request.reelCopy} fullWidth />
                            <Field label="Colaboración" value={request.reelCollaboration ? `SÍ (${request.reelCollabHandle})` : 'NO'} fullWidth />
                        </div>
                    )}

                    {request.contentType === 'Carrusel' && (
                        <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded">
                            <h3 className="font-bold text-purple-800 mb-2">Detalles del Carrusel</h3>
                            <Field label="Copy de la publicación" value={request.reelCopy} fullWidth />
                            <Field label="Colaboración" value={request.reelCollaboration ? `SÍ (${request.reelCollabHandle})` : 'NO'} fullWidth />
                            
                            {request.carouselSlides && request.carouselSlides.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="font-bold text-sm mb-2 text-purple-900">Slides:</h4>
                                    <div className="space-y-2">
                                        {request.carouselSlides.map((slide, idx) => (
                                            <div key={idx} className="p-2 bg-white border border-purple-100 rounded text-sm">
                                                <span className="font-bold text-purple-400 mr-2">#{idx + 1}</span>
                                                <span>{slide.text}</span>
                                                {slide.link && <p className="mt-1 text-blue-600 text-xs break-all">{slide.link}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {request.observations && (
                    <div className="w-full">
                        <SectionTitle title="4. Observaciones Adicionales" />
                        <Field label="Observaciones" value={request.observations} fullWidth />
                    </div>
                )}
            </div>
            
        </div>
      </div>
    );
});

SocialMediaPdf.displayName = 'SocialMediaPdf';
