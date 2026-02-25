// src/components/publicidad/advertising-pdf.tsx

import React, { forwardRef } from 'react';
import { AdvertisingOrder, Program } from '@/lib/types';
import { format, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdvertisingOrderPdfProps {
  order: AdvertisingOrder;
  programs: Program[];
  hidePrices?: boolean; // 🟢 NUEVA PROPIEDAD: "Modo Redacción"
}

export const AdvertisingOrderPdf = forwardRef<HTMLDivElement, AdvertisingOrderPdfProps>(({ order, programs = [], hidePrices = false }, ref) => {
  if (!order) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "dd/MM/yyyy");
    } catch {
      return "-";
    }
  };

  const srlItems = order.srlItems || [];
  const sasItems = order.sasItems || [];
  
  const startDate = order.startDate ? new Date(order.startDate) : new Date();
  const endDate = order.endDate ? new Date(order.endDate) : new Date();
  
  let months: Date[] = [];
  try {
      if (startDate <= endDate) {
          months = eachMonthOfInterval({ start: startDate, end: endDate });
      }
  } catch (e) {
      months = [new Date()];
  }

  const srlSubtotal = srlItems.reduce((acc, item) => {
      const dailySpots = item.dailySpots || {};
      const totalAds = Object.values(dailySpots).reduce((sum, val) => sum + (Number(val) || 0), 0);
      const mult = item.adType === 'Spot' ? (item.seconds || 0) : 1;
      return acc + ((item.unitRate || 0) * totalAds * mult);
  }, 0);
  const srlAdjustment = order.adjustmentSrl || 0;
  const srlTotalToInvoice = srlSubtotal - srlAdjustment;
  const srlCommissionPct = order.agencySale ? (order.commissionSrl || 0) : 0;
  const srlAgencyAmount = srlTotalToInvoice * (srlCommissionPct / 100);
  const srlNetAction = srlTotalToInvoice - srlAgencyAmount;

  const sasSubtotal = sasItems.reduce((acc, item) => {
      let net = 0;
      if (item.format === "Banner") {
          net = (item.cpm || 0) * (item.unitRate || 0);
      } else {
          net = (item.unitRate || 0);
      }
      return acc + net;
  }, 0);
  const sasAdjustment = order.adjustmentSas || 0;
  const sasBase = sasSubtotal - sasAdjustment;
  const sasIva = sasBase * 0.05; 
  const sasTotalToInvoice = sasBase + sasIva;
  const sasCommissionPct = order.agencySale ? (order.commissionSrl || 0) : 0;
  const sasAgencyAmount = sasTotalToInvoice * (sasCommissionPct / 100);
  const sasNetAction = sasTotalToInvoice - sasAgencyAmount;

  const styles = {
      page: { width: '297mm', minHeight: '210mm', padding: '15mm', backgroundColor: 'white', fontFamily: 'Arial, sans-serif', color: '#000', boxSizing: 'border-box' as const, fontSize: '11px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
      header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #ccc', paddingBottom: '10px' },
      clientInfoContainer: { marginBottom: '20px', backgroundColor: '#f9fafb', padding: '10px', borderRadius: '4px', border: '1px solid #e5e7eb' },
      sectionTitle: { backgroundColor: '#e5e7eb', padding: '5px', fontWeight: 'bold', textTransform: 'uppercase' as const, fontSize: '12px', borderBottom: '2px solid #dc2626', marginBottom: '10px' },
      dataRow: { display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '4px 0' },
      label: { fontWeight: 'bold', width: '100px' },
      table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '10px', marginBottom: '10px' },
      th: { border: '1px solid #9ca3af', padding: '5px 2px', backgroundColor: '#f3f4f6', textAlign: 'center' as const, fontWeight: 'bold' },
      td: { border: '1px solid #9ca3af', padding: '5px 2px', textAlign: 'center' as const },
      totalBox: { width: '280px', marginLeft: 'auto', marginTop: '10px', border: '1px solid #9ca3af', padding: '8px', backgroundColor: '#f9fafb' },
      totalRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }
  };

  const renderHeader = () => (
    <div style={styles.header}>
      <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626', margin: 0 }}>ORDEN DE PUBLICIDAD</h1>
          <p style={{ color: '#6b7280', fontWeight: 'bold', margin: 0 }}>Aire de Santa Fe</p>
          {hidePrices && <span style={{ backgroundColor: '#fef08a', color: '#9a3412', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', marginTop: '4px', display: 'inline-block' }}>COPIA REDACCIÓN</span>}
      </div>
      <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0 }}><strong>Emisión:</strong> {format(new Date(), "dd/MM/yyyy")}</p>
          <p style={{ margin: 0 }}><strong>Ejecutivo:</strong> {order.accountExecutive}</p>
      </div>
    </div>
  );

  const renderClientInfo = () => {
    const isUrl = order.materialUrl && (order.materialUrl.startsWith('http') || order.materialUrl.startsWith('www.'));
    const linkHref = isUrl ? (order.materialUrl!.startsWith('http') ? order.materialUrl : `https://${order.materialUrl}`) : undefined;

    return (
      <div style={styles.clientInfoContainer}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={styles.dataRow}><span style={styles.label}>Cliente:</span><span>{order.clientName}</span></div>
            <div style={styles.dataRow}><span style={styles.label}>Agencia:</span><span>{order.agencyName || "-"}</span></div>
            <div style={styles.dataRow}><span style={styles.label}>Producto:</span><span>{order.opportunityTitle || order.product || "-"}</span></div>
            <div style={styles.dataRow}><span style={styles.label}>Orden Tango:</span><span>{order.tangoOrderNo || "-"}</span></div>
            <div style={styles.dataRow}>
                <span style={styles.label}>Vigencia:</span>
                <span style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{formatDate(order.startDate)} al {formatDate(order.endDate)}</span>
            </div>
            {/* 🟢 NUEVO CAMPO: MATERIALES */}
            <div style={styles.dataRow}>
                <span style={styles.label}>Materiales:</span>
                <span>
                   {isUrl ? (
                      <a href={linkHref} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '2px 8px', backgroundColor: '#eff6ff', borderRadius: '4px', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 'bold', textDecoration: 'none' }}>👉 VER MATERIALES 👈</a>
                   ) : (
                      order.materialUrl || (order.materialSent ? "Sí (Adjunto)" : "Pendiente")
                   )}
                </span>
            </div>
            {order.observations && (
              <div style={{ ...styles.dataRow, gridColumn: 'span 2' }}>
                  <span style={styles.label}>Obs:</span>
                  <span style={{ fontStyle: 'italic' }}>{order.observations}</span>
              </div>
            )}
        </div>
      </div>
    );
  };

  const renderSRL = () => (
    <div style={{ marginBottom: '30px' }}>
        <div style={styles.sectionTitle}>PAUTA AIRE SRL</div>
        {months.map((monthDate) => {
            const monthKey = format(monthDate, "yyyy-MM");
            const itemsInMonth = srlItems.filter(item => item.month === monthKey);
            if (itemsInMonth.length === 0) return null;

            const mStart = startOfMonth(monthDate);
            const mEnd = endOfMonth(monthDate);
            const effectiveStart = mStart < startDate ? startDate : mStart;
            const effectiveEnd = mEnd > endDate ? endDate : mEnd;
            const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });

            return (
                <div key={monthKey} style={{ marginBottom: '15px' }}>
                    <div style={{ backgroundColor: '#e5e7eb', padding: '4px 8px', fontWeight: 'bold', fontSize: '11px', border: '1px solid #9ca3af', borderBottom: 'none' }}>
                        {format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase()}
                    </div>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ ...styles.th, textAlign: 'left', width: 'auto' }}>Programa</th>
                                <th style={{ ...styles.th, width: '80px' }}>Tipo</th>
                                <th style={{ ...styles.th, width: '30px' }}>TV</th>
                                <th style={{ ...styles.th, width: '35px' }}>Seg</th>
                                {days.map(d => (<th key={d.toISOString()} style={{ ...styles.th, width: '22px', fontSize: '9px' }}>{format(d, "d")}</th>))}
                                <th style={{ ...styles.th, width: '40px' }}>Cant</th>
                                {/* 🟢 Ocultar columnas si está en modo redacción */}
                                {!hidePrices && <th style={{ ...styles.th, width: '60px' }}>T. Unit</th>}
                                {!hidePrices && <th style={{ ...styles.th, width: '90px' }}>Neto</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {itemsInMonth.map((item, idx) => {
                                const progName = programs.find(p => p.id === item.programId)?.name || item.programId;
                                const dailySpots = item.dailySpots || {};
                                const totalAds = Object.values(dailySpots).reduce((sum, val) => sum + (Number(val) || 0), 0);
                                const mult = item.adType === 'Spot' ? (item.seconds || 0) : 1;
                                const net = (item.unitRate || 0) * totalAds * mult;

                                return (
                                    <tr key={idx}>
                                        <td style={{ ...styles.td, textAlign: 'left', fontWeight: 'bold' }}>{progName}</td>
                                        <td style={styles.td}>{item.adType}</td>
                                        <td style={styles.td}>{item.hasTv ? 'SI' : ''}</td>
                                        <td style={styles.td}>{item.adType === 'Spot' ? item.seconds : '-'}</td>
                                        {days.map(d => {
                                            const val = dailySpots[format(d, "yyyy-MM-dd")];
                                            return (<td key={d.toISOString()} style={{ ...styles.td, backgroundColor: val ? '#dbeafe' : 'transparent', fontWeight: val ? 'bold' : 'normal' }}>{val || ''}</td>);
                                        })}
                                        <td style={{ ...styles.td, fontWeight: 'bold' }}>{totalAds}</td>
                                        {/* 🟢 Ocultar valores en modo redacción */}
                                        {!hidePrices && <td style={styles.td}>${(item.unitRate || 0).toLocaleString('es-AR')}</td>}
                                        {!hidePrices && <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>${net.toLocaleString('es-AR')}</td>}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
        })}

        {!hidePrices && (
          <div style={styles.totalBox}>
              <div style={styles.totalRow}><span>Subtotal:</span><span>${srlSubtotal.toLocaleString('es-AR')}</span></div>
              <div style={styles.totalRow}><span>Desajuste:</span><span>${srlAdjustment.toLocaleString('es-AR')}</span></div>
              <div style={{ ...styles.totalRow, fontWeight: 'bold', borderTop: '1px solid #d1d5db', paddingTop: '4px' }}>
                  <span>Total a Facturar:</span><span>${srlTotalToInvoice.toLocaleString('es-AR')}</span>
              </div>
              <div style={{ ...styles.totalRow, color: '#6b7280' }}><span>Agencia ({srlCommissionPct}%):</span><span>${srlAgencyAmount.toLocaleString('es-AR')}</span></div>
              <div style={{ ...styles.totalRow, fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>
                  <span>Neto de Acción:</span><span>${srlNetAction.toLocaleString('es-AR')}</span>
              </div>
          </div>
        )}
    </div>
  );

  const renderSAS = () => (
    <div style={{ marginBottom: '20px' }}>
        <div style={styles.sectionTitle}>PAUTA DIGITAL (SAS)</div>
        <table style={styles.table}>
            <thead>
                <tr>
                    <th style={{ ...styles.th, textAlign: 'left', width: '20%' }}>Formato</th>
                    <th style={{ ...styles.th, textAlign: 'left', width: '30%' }}>Detalle</th>
                    <th style={{ ...styles.th, width: '15%' }}>Ubicación</th>
                    <th style={{ ...styles.th, textAlign: 'left', width: '20%' }}>Obs</th>
                    {!hidePrices && <th style={{ ...styles.th, textAlign: 'right', width: '15%' }}>Neto</th>}
                </tr>
            </thead>
            <tbody>
                {sasItems.map((item, i) => {
                    let net = 0;
                    if (item.format === "Banner") { net = (item.cpm || 0) * (item.unitRate || 0); } else { net = (item.unitRate || 0); }
                    const locs = [];
                    if(item.desktop) locs.push("D"); if(item.mobile) locs.push("M"); if(item.home) locs.push("H"); if(item.interiores) locs.push("I");

                    return (
                        <tr key={i}>
                            <td style={{ ...styles.td, textAlign: 'left', fontWeight: 'bold' }}>{item.format}</td>
                            <td style={{ ...styles.td, textAlign: 'left' }}>{item.detail || item.type || "-"}</td>
                            <td style={styles.td}>{locs.join(", ") || "-"}</td>
                            <td style={{ ...styles.td, textAlign: 'left', fontStyle: 'italic', color: '#6b7280' }}>{item.observations}</td>
                            {!hidePrices && <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>${net.toLocaleString('es-AR')}</td>}
                        </tr>
                    );
                })}
            </tbody>
        </table>

        {!hidePrices && (
          <div style={styles.totalBox}>
              <div style={styles.totalRow}><span>Subtotal:</span><span>${sasSubtotal.toLocaleString('es-AR')}</span></div>
              <div style={styles.totalRow}><span>Desajuste:</span><span>${sasAdjustment.toLocaleString('es-AR')}</span></div>
              <div style={styles.totalRow}><span>IVA 5%:</span><span>${sasIva.toLocaleString('es-AR')}</span></div>
              <div style={{ ...styles.totalRow, fontWeight: 'bold', borderTop: '1px solid #d1d5db', paddingTop: '4px' }}>
                  <span>Total a Facturar:</span><span>${sasTotalToInvoice.toLocaleString('es-AR')}</span>
              </div>
              <div style={{ ...styles.totalRow, color: '#6b7280' }}><span>Agencia ({sasCommissionPct}%):</span><span>${sasAgencyAmount.toLocaleString('es-AR')}</span></div>
              <div style={{ ...styles.totalRow, fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>
                  <span>Neto de Acción:</span><span>${sasNetAction.toLocaleString('es-AR')}</span>
              </div>
          </div>
        )}
    </div>
  );

  const renderFooter = () => (
    <>
      {!hidePrices && (
        <div style={{ marginTop: '30px', borderTop: '2px solid #000', paddingTop: '10px', textAlign: 'right' }}>
            <p style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Total Pedido: ${ (order.totalOrder || 0).toLocaleString('es-AR') }</p>
        </div>
      )}
      <div style={{ marginTop: hidePrices ? '30px' : '60px', borderTop: '1px solid #000', width: '250px', textAlign: 'center', fontSize: '11px', paddingTop: '5px' }}>
          Firma Cliente
      </div>
    </>
  );

  const hasSRL = srlItems.length > 0;
  const hasSAS = sasItems.length > 0;
  const isMultiPage = hasSRL && hasSAS;

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
      <div id="ad-pdf-page-1" style={styles.page}>
        {renderHeader()}
        {renderClientInfo()}
        {hasSRL && renderSRL()}
        {!hasSRL && hasSAS && renderSAS()}
        {!isMultiPage && renderFooter()}
      </div>

      {isMultiPage && (
        <div id="ad-pdf-page-2" style={styles.page}>
          {renderHeader()}
          {renderClientInfo()}
          {renderSAS()}
          {renderFooter()}
        </div>
      )}
    </div>
  );
});

AdvertisingOrderPdf.displayName = 'AdvertisingOrderPdf';
