'use client';

import React from 'react';
import type { ConvenioCanje } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface ConvenioPdfProps {
  convenio: Partial<ConvenioCanje> & { valorMonetario?: number };
}

export const ConvenioPdf = React.forwardRef<HTMLDivElement, ConvenioPdfProps>(({ convenio }, ref) => {
    const pageStyle: React.CSSProperties = {
        width: '210mm',
        minHeight: '297mm',
        padding: '25mm 20mm',
        backgroundColor: 'white',
        fontFamily: 'Arial, sans-serif',
        position: 'relative',
        boxSizing: 'border-box',
        color: '#1a1a1a',
        fontSize: '11pt',
        lineHeight: '1.5'
    };

    return (
      <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={pageStyle}>
            
            <header style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '40px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.webp" alt="AIRE Logo" style={{ width: '130px', height: 'auto' }} />
            </header>

            <main>
                <div style={{ textAlign: 'right', marginBottom: '30px' }}>
                    Santa Fe, {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es })}
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <strong>Cliente:</strong> {convenio.clientName}
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <strong>Medio:</strong> AIRE DE SANTA FE
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <strong>Plazo convenio:</strong> {convenio.fechaInicio ? format(parseISO(convenio.fechaInicio), 'dd/MM/yyyy') : '-'} al {convenio.fechaFin ? format(parseISO(convenio.fechaFin), 'dd/MM/yyyy') : '-'}
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <strong>Importe / Valor:</strong> ${convenio.valorMonetario?.toLocaleString('es-AR') || '0'}
                </div>

                <div style={{ marginTop: '40px', marginBottom: '20px' }}>
                    <strong>El Cliente provee:</strong>
                    <div style={{ marginTop: '10px', paddingLeft: '15px', whiteSpace: 'pre-wrap' }}>
                        {convenio.clienteEntrega}
                    </div>
                </div>

                <div style={{ marginTop: '40px', marginBottom: '20px' }}>
                    <strong>Aire de Santa Fe provee:</strong>
                    <div style={{ marginTop: '10px', paddingLeft: '15px', whiteSpace: 'pre-wrap' }}>
                        {convenio.radioEntrega}
                    </div>
                </div>

                {convenio.observaciones && (
                    <div style={{ marginTop: '40px', marginBottom: '20px' }}>
                        <strong>Observaciones:</strong>
                        <div style={{ marginTop: '10px', paddingLeft: '15px', whiteSpace: 'pre-wrap' }}>
                            {convenio.observaciones}
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '80px', display: 'flex', justifyContent: 'flex-end', textAlign: 'center' }}>
                    <div style={{ width: '200px' }}>
                        <div style={{ borderTop: '1px solid #000', marginBottom: '5px' }}></div>
                        <strong>{convenio.advisorName}</strong><br/>
                        <span style={{ fontSize: '9pt', color: '#666' }}>Firma Comercial</span>
                    </div>
                </div>
            </main>

            <footer style={{ position: 'absolute', bottom: '25mm', left: '20mm', right: '20mm', borderTop: '2px solid #dc2626', paddingTop: '10px', fontSize: '9pt', color: '#666' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                        <strong>AIRE SRL</strong><br/>
                        CUIT 30-71599389-5<br/>
                        25 de Mayo 3255. Santa Fe, Santa Fe, Argentina | CP 3000
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <a href="https://www.airedigital.com" style={{ color: '#dc2626', textDecoration: 'none' }}>→ www.airedigital.com</a>
                    </div>
                </div>
            </footer>
        </div>
      </div>
    );
});

ConvenioPdf.displayName = 'ConvenioPdf';
