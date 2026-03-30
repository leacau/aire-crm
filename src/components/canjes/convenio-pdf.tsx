'use client';

import React from 'react';
import type { ConvenioCanje } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface ConvenioPdfProps {
  convenio: Partial<ConvenioCanje>;
}

export const ConvenioPdf = React.forwardRef<HTMLDivElement, ConvenioPdfProps>(({ convenio }, ref) => {
    const pageStyle: React.CSSProperties = {
        width: '210mm',
        minHeight: '297mm',
        padding: '20mm',
        backgroundColor: 'white',
        fontFamily: 'Arial, sans-serif',
        position: 'relative',
        boxSizing: 'border-box',
        color: '#333'
    };

    return (
      <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={pageStyle}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #dc2626', paddingBottom: '20px', marginBottom: '30px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.webp" alt="AIRE Logo" style={{ width: '150px', height: 'auto' }} />
                <div style={{ textAlign: 'right' }}>
                    <h1 style={{ fontSize: '24px', color: '#dc2626', margin: 0, fontWeight: 'bold' }}>CONVENIO DE CANJE</h1>
                    <p style={{ margin: '5px 0 0 0', color: '#666' }}>Fecha: {format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}</p>
                </div>
            </header>

            <main style={{ fontSize: '14px', lineHeight: '1.6' }}>
                <p style={{ marginBottom: '20px' }}>
                    Entre <strong>AIRE DE SANTA FE</strong>, representado en este acto por el ejecutivo comercial <strong>{convenio.advisorName}</strong>, 
                    y la empresa/cliente <strong>{convenio.clientName}</strong>, se acuerda el siguiente convenio de intercambio publicitario (Canje).
                </p>

                <div style={{ backgroundColor: '#f9fafb', padding: '15px', borderLeft: '4px solid #dc2626', marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#111827' }}>VIGENCIA DEL ACUERDO</h3>
                    <p style={{ margin: 0 }}>
                        <strong>Desde:</strong> {convenio.fechaInicio ? format(parseISO(convenio.fechaInicio), 'dd/MM/yyyy') : '-'} <br/>
                        <strong>Hasta:</strong> {convenio.fechaFin ? format(parseISO(convenio.fechaFin), 'dd/MM/yyyy') : '-'}
                    </p>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>1. AIRE DE SANTA FE ENTREGA (Pautado Publicitario):</h3>
                    <p style={{ whiteSpace: 'pre-wrap', backgroundColor: '#fff', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                        {convenio.radioEntrega}
                    </p>
                </div>

                <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ fontSize: '16px', color: '#111827', borderBottom: '1px solid #e5e7eb', paddingBottom: '5px' }}>2. EL CLIENTE ENTREGA (Bienes / Servicios):</h3>
                    <p style={{ whiteSpace: 'pre-wrap', backgroundColor: '#fff', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                        {convenio.clienteEntrega}
                    </p>
                </div>

                {convenio.observaciones && (
                    <div style={{ marginBottom: '40px', fontSize: '12px', color: '#4b5563' }}>
                        <strong>Observaciones Adicionales:</strong><br/>
                        {convenio.observaciones}
                    </div>
                )}

                <div style={{ marginTop: '60px', display: 'flex', justifyContent: 'space-between', textAlign: 'center' }}>
                    <div style={{ width: '40%', borderTop: '1px solid #000', paddingTop: '10px' }}>
                        <strong>{convenio.clientName}</strong><br/>
                        <span style={{ fontSize: '12px', color: '#666' }}>Firma y Aclaración</span>
                    </div>
                    <div style={{ width: '40%', borderTop: '1px solid #000', paddingTop: '10px' }}>
                        <strong>{convenio.advisorName}</strong><br/>
                        <span style={{ fontSize: '12px', color: '#666' }}>Representante Comercial</span>
                    </div>
                </div>
            </main>
        </div>
      </div>
    );
});

ConvenioPdf.displayName = 'ConvenioPdf';
