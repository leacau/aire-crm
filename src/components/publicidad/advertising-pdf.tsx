import React, { forwardRef } from 'react';
import { AdvertisingOrder, Program } from '@/lib/types';
import { format, eachDayOfInterval, addDays, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdvertisingOrderPdfProps {
  order: AdvertisingOrder;
  programs: Program[];
  hidePrices?: boolean; 
  hideSrl?: boolean; // 🟢 NUEVA PROPIEDAD PARA OCULTAR SRL A REDACCIÓN
}

export const AdvertisingOrderPdf = forwardRef<HTMLDivElement, AdvertisingOrderPdfProps>(({ order, programs = [], hidePrices = false, hideSrl = false }, ref) => {
  if (!order) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    try {
      const safeStr = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`;
      return format(new Date(safeStr), "dd/MM/yyyy");
    } catch {
      return "-";
    }
  };

  const srlItems = order.srlItems || [];
  const sasItems = order.sasItems || [];
  
  const startDate = order.startDate ? new Date(order.startDate) : new Date();
  const endDate = order.endDate ? new Date(order.endDate) : new Date();
  
  // 🟢 Calculamos los días del primer ciclo para la propuesta mensual
  let days: Date[] = [];
  try {
      const firstMonthStart = startDate;
      const firstMonthEnd = addDays(addMonths(startDate, 1), -1);
      const effectiveEnd = firstMonthEnd > endDate ? endDate : firstMonthEnd;
      if (firstMonthStart <= effectiveEnd) {
          days = eachDayOfInterval({ start: firstMonthStart, end: effectiveEnd });
      }
  } catch (e) {
      console.error(e);
      days = [new Date()];
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

  // 🟢 SI HIDESRL ESTÁ ACTIVO, FORZAMOS HASSRL A FALSE PARA QUE NO DIBUJE NADA
  const hasSRL = !hideSrl && srlItems.length > 0;
  const hasSAS = sasItems.length > 0;

  const styles = {
      container: { width: '297mm', padding: '15mm', backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#000', boxSizing: 'border-box' as const, fontSize: '11px' },
      header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #ccc', paddingBottom: '10px' },
      clientInfoContainer: { marginBottom: '20px', backgroundColor: '#f9fafb', padding: '10px', borderRadius: '4px', border: '1px solid #e5e7eb' },
      sectionTitle: { backgroundColor: '#e5e7eb', padding: '5px', fontWeight: 'bold', textTransform: 'uppercase' as const, fontSize: '12px', borderBottom: '2px solid #dc2626', marginBottom: '10px' },
      dataRow: { display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '4px 0' },
      label: { fontWeight: 'bold', width: '100px' },
      table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '10px', marginBottom: '10px' },
      th: { border: '1px solid #9ca3af', padding: '5px 2px', backgroundColor: '#f3f4f6', textAlign: 'center' as const, fontWeight: 'bold' },
      td: { border: '1px solid #9ca3af', padding: '5px 2px', textAlign: 'center' as const },
      totalBox: { width: '280px', marginLeft: 'auto', border: '1px solid #9ca3af', padding: '8px', backgroundColor: '#f9fafb' },
      totalRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }
  };

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

  const renderHeaderAndInfo = () => {
    return (
        <div className="pdf-block" style={{ marginBottom: '20px' }}>
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
            {renderClientInfo()}
        </div>
    );
  };

  const renderBillingRequestsSrl = () => {
      if (hidePrices || !order.billingRequestsSrl || order.billingRequestsSrl.length === 0 || !hasSRL) {
          return <div style={{ flex: 1 }} />; 
      }

      return (
          <div style={{ flex: 1, marginRight: '20px' }}>
              <div style={{ width: '260px', border: '1px solid #9ca3af', padding: '8px', backgroundColor: '#fef3c7' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #d1d5db', paddingBottom: '4px', color: '#9a3412', fontSize: '10px' }}>
                      FACTURACIÓN SRL (SUGERENCIA INTERNA)
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Fecha</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Bruto</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Desaj.</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Neto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.billingRequestsSrl.map((br, i) => (
                                <tr key={i}>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db' }}>{formatDate(br.date)}</td>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db', textAlign: 'right' }}>${Number(br.grossAmount || 0).toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db', textAlign: 'right' }}>${Number(br.adjustment || 0).toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db', textAlign: 'right', fontWeight: 'bold' }}>
                                        ${Number(br.amount || 0).toLocaleString('es-AR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                  </table>
              </div>
          </div>
      );
  };

  const renderBillingRequestsSas = () => {
      if (hidePrices || !order.billingRequestsSas || order.billingRequestsSas.length === 0 || !hasSAS) {
          return <div style={{ flex: 1 }} />; 
      }

      return (
          <div style={{ flex: 1, marginRight: '20px' }}>
              <div style={{ width: '340px', border: '1px solid #9ca3af', padding: '8px', backgroundColor: '#fef3c7' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #d1d5db', paddingBottom: '4px', color: '#9a3412', fontSize: '10px' }}>
                      FACTURACIÓN SAS (SUGERENCIA INTERNA)
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Fecha</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Bruto</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Desaj.</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>IVA(5%)</th>
                                <th style={{ textAlign: 'right', borderBottom: '1px solid #9ca3af', paddingBottom: '2px' }}>Neto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.billingRequestsSas.map((br, i) => (
                                <tr key={i}>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db' }}>{formatDate(br.date)}</td>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db', textAlign: 'right' }}>${Number(br.grossAmount || 0).toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db', textAlign: 'right' }}>${Number(br.adjustment || 0).toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db', textAlign: 'right' }}>${Number(br.ivaSas || 0).toLocaleString('es-AR')}</td>
                                    <td style={{ padding: '3px 0', borderBottom: '1px dotted #d1d5db', textAlign: 'right', fontWeight: 'bold' }}>
                                        ${Number(br.amount || 0).toLocaleString('es-AR')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                  </table>
              </div>
          </div>
      );
  };

  const renderSRLSection = () => {
        if (!hasSRL) return null;

        // 🟢 Filtramos solo los ítems mensuales por las dudas
        const itemsToRender = srlItems.filter(item => item.month === "Mensual" || !item.month);
        if (itemsToRender.length === 0) return null;

        return (
            <div className="pdf-block" style={{ marginBottom: '20px' }}>
                <div style={styles.sectionTitle}>PAUTA AIRE SRL</div>
                <div>
                    <div style={{ backgroundColor: '#e5e7eb', padding: '4px 8px', fontWeight: 'bold', fontSize: '11px', border: '1px solid #9ca3af', borderBottom: 'none' }}>
                        PROPUESTA MENSUAL
                    </div>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ ...styles.th, textAlign: 'left', width: 'auto' }}>Programa</th>
                                <th style={{ ...styles.th, width: '80px' }}>Tipo</th>
                                <th style={{ ...styles.th, width: '30px' }}>TV</th>
                                <th style={{ ...styles.th, width: '35px' }}>Seg</th>
                                {days.map(d => (<th key={d.toISOString()} style={{ ...styles.th, width: '22px', fontSize: '9px' }}>{format(d, "d")}</th>))}
                                <th style={{ ...styles.th, width: '40px' }}>Cant.<br/>Repet.</th>
                                <th style={{ ...styles.th, width: '40px' }}>Tot.<br/>Seg.</th>
                                {!hidePrices && <th style={{ ...styles.th, width: '60px' }}>T. Unit</th>}
                                {!hidePrices && <th style={{ ...styles.th, width: '90px' }}>Neto</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {itemsToRender.map((item, idx) => {
                                const progName = item.programId === 'Personalizado' ? 'Personalizado' : (programs.find(p => p.id === item.programId)?.name || item.programId);
                                const typeLabel = (item.programId === 'Personalizado' || item.adType === 'Personalizado') ? (item.customType || 'Personalizado') : item.adType;

                                const dailySpots = item.dailySpots || {};
                                const totalAds = Object.values(dailySpots).reduce((sum, val) => sum + (Number(val) || 0), 0);
                                const mult = item.adType === 'Spot' ? (item.seconds || 0) : 1;
                                const totalSecs = item.adType === 'Spot' ? totalAds * mult : '-';
                                const net = (item.unitRate || 0) * totalAds * mult;

                                return (
                                    <tr key={idx}>
                                        <td style={{ ...styles.td, textAlign: 'left', fontWeight: 'bold' }}>{progName}</td>
                                        <td style={styles.td}>{typeLabel}</td>
                                        <td style={styles.td}>{item.hasTv ? 'SI' : ''}</td>
                                        <td style={styles.td}>{item.adType === 'Spot' ? item.seconds : '-'}</td>
                                        {days.map(d => {
                                            const val = dailySpots[format(d, "yyyy-MM-dd")];
                                            return (<td key={d.toISOString()} style={{ ...styles.td, backgroundColor: val ? '#dbeafe' : 'transparent', fontWeight: val ? 'bold' : 'normal' }}>{val || ''}</td>);
                                        })}
                                        <td style={{ ...styles.td, fontWeight: 'bold' }}>{totalAds}</td>
                                        <td style={{ ...styles.td, fontWeight: 'bold' }}>{totalSecs}</td>
                                        {!hidePrices && <td style={styles.td}>${(item.unitRate || 0).toLocaleString('es-AR')}</td>}
                                        {!hidePrices && <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>${net.toLocaleString('es-AR')}</td>}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
  };

  const renderSRLTotals = () => {
    if (hidePrices || !hasSRL) return null;
    return (
        <div className="pdf-block" style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                 {renderBillingRequestsSrl()}
                 <div style={{ ...styles.totalBox, marginTop: 0 }}>
                    <div style={styles.totalRow}><span>Subtotal Mensual:</span><span>${srlSubtotal.toLocaleString('es-AR')}</span></div>
                    <div style={styles.totalRow}><span>Desajuste:</span><span>${srlAdjustment.toLocaleString('es-AR')}</span></div>
                    <div style={{ ...styles.totalRow, fontWeight: 'bold', borderTop: '1px solid #d1d5db', paddingTop: '4px' }}>
                        <span>Total a Facturar (Mes):</span><span>${srlTotalToInvoice.toLocaleString('es-AR')}</span>
                    </div>
                    <div style={{ ...styles.totalRow, color: '#6b7280' }}><span>Agencia ({srlCommissionPct}%):</span><span>${srlAgencyAmount.toLocaleString('es-AR')}</span></div>
                    <div style={{ ...styles.totalRow, fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>
                        <span>Neto de Acción:</span><span>${srlNetAction.toLocaleString('es-AR')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const renderSASSection = () => {
        if (!hasSAS) return null;

        const itemsToRender = sasItems.filter(item => item.month === "Mensual" || !item.month);
        if (itemsToRender.length === 0) return null;

        return (
            <div className="pdf-block" style={{ marginBottom: '20px' }}>
                <div style={styles.sectionTitle}>PAUTA DIGITAL (SAS)</div>
                <div>
                    <div style={{ backgroundColor: '#e5e7eb', padding: '4px 8px', fontWeight: 'bold', fontSize: '11px', border: '1px solid #9ca3af', borderBottom: 'none' }}>
                        PROPUESTA MENSUAL
                    </div>
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
                            {itemsToRender.map((item, i) => {
                                let net = 0;
                                if (item.format === "Banner") { net = (item.cpm || 0) * (item.unitRate || 0); } else { net = (item.unitRate || 0); }
                                const locs = [];
                                if(item.desktop) locs.push("D"); if(item.mobile) locs.push("M"); if(item.home) locs.push("H"); if(item.interiores) locs.push("I");

                                const detailLabel = item.format === 'Personalizado' ? (item.customDetail || "-") : (item.detail || item.type || "-");

                                return (
                                    <tr key={i}>
                                        <td style={{ ...styles.td, textAlign: 'left', fontWeight: 'bold' }}>{item.format}</td>
                                        <td style={{ ...styles.td, textAlign: 'left' }}>{detailLabel}</td>
                                        <td style={styles.td}>{locs.join(", ") || "-"}</td>
                                        <td style={{ ...styles.td, textAlign: 'left', fontStyle: 'italic', color: '#6b7280' }}>{item.observations}</td>
                                        {!hidePrices && <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>${net.toLocaleString('es-AR')}</td>}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
  };

  const renderSASTotals = () => {
    if (hidePrices || !hasSAS) return null;
    return (
        <div className="pdf-block" style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '10px' }}>
                {renderBillingRequestsSas()}

                <div style={{ ...styles.totalBox, marginTop: 0 }}>
                    <div style={styles.totalRow}><span>Subtotal Mensual:</span><span>${sasSubtotal.toLocaleString('es-AR')}</span></div>
                    <div style={styles.totalRow}><span>Desajuste:</span><span>${sasAdjustment.toLocaleString('es-AR')}</span></div>
                    <div style={styles.totalRow}><span>IVA 5%:</span><span>${sasIva.toLocaleString('es-AR')}</span></div>
                    <div style={{ ...styles.totalRow, fontWeight: 'bold', borderTop: '1px solid #d1d5db', paddingTop: '4px' }}>
                        <span>Total a Facturar (Mes):</span><span>${sasTotalToInvoice.toLocaleString('es-AR')}</span>
                    </div>
                    <div style={{ ...styles.totalRow, color: '#6b7280' }}><span>Agencia ({sasCommissionPct}%):</span><span>${sasAgencyAmount.toLocaleString('es-AR')}</span></div>
                    <div style={{ ...styles.totalRow, fontWeight: 'bold', color: '#15803d', marginTop: '4px' }}>
                        <span>Neto de Acción:</span><span>${sasNetAction.toLocaleString('es-AR')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const renderFooter = () => (
    <div className="pdf-block" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: '20px' }}>
      {!hidePrices && (
        <div style={{ width: '100%', borderTop: '2px solid #000', paddingTop: '10px', textAlign: 'right' }}>
            <p style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>Total Sugerido Facturación: ${ (order.totalOrder || 0).toLocaleString('es-AR') }</p>
        </div>
      )}
      <div style={{ marginTop: hidePrices ? '20px' : '40px', borderTop: '1px solid #000', width: '250px', textAlign: 'center', fontSize: '11px', paddingTop: '5px', marginLeft: 'auto' }}>
          Firma Cliente
      </div>
    </div>
  );

  return (
    <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }}>
      <div style={styles.container}>
        {renderHeaderAndInfo()}
        
        {renderSRLSection()}
        {renderSRLTotals()}

        {renderSASSection()}
        {renderSASTotals()}
        
        {renderFooter()}
      </div>
    </div>
  );
});

AdvertisingOrderPdf.displayName = 'AdvertisingOrderPdf';
