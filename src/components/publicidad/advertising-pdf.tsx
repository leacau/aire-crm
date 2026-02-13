//src/components/publicidad/advertising-pdf.tsx

import React, { forwardRef } from 'react';
import { AdvertisingOrder, Program } from '@/lib/types';
import { format, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdvertisingOrderPdfProps {
  order: AdvertisingOrder;
  programs: Program[];
}

export const AdvertisingOrderPdf = forwardRef<HTMLDivElement, AdvertisingOrderPdfProps>(({ order, programs }, ref) => {
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

  // --- CÁLCULOS SRL ---
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

  // --- CÁLCULOS SAS ---
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
  const sasIva = sasBase * 0.05; // 5% IVA Digital
  const sasTotalToInvoice = sasBase + sasIva;
  // Asumimos misma comisión de agencia que SRL si aplica, o 0
  const sasCommissionPct = order.agencySale ? (order.commissionSrl || 0) : 0;
  const sasAgencyAmount = sasTotalToInvoice * (sasCommissionPct / 100);
  const sasNetAction = sasTotalToInvoice - sasAgencyAmount;


  // Estilos fijos A4
  const pageStyle: React.CSSProperties = {
    width: '210mm',
    minHeight: '297mm',
    padding: '10mm',
    backgroundColor: 'white',
    fontFamily: 'Arial, sans-serif',
    color: '#000',
    position: 'relative',
    boxSizing: 'border-box',
    fontSize: '10px',
  };

  const totalBoxStyle: React.CSSProperties = {
      width: '300px', // Ancho fijo para el cuadro de totales
      marginLeft: 'auto',
      marginTop: '10px',
      border: '1px solid #ccc',
      padding: '5px',
      backgroundColor: '#f9f9f9'
  };

  const totalRowStyle: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '3px',
      fontSize: '10px'
  };

  return (
    <div ref={ref} style={pageStyle}>
      
      {/* HEADER */}
      <header className="flex justify-between items-center mb-4 border-b-2 border-slate-300 pb-2">
        <div>
           <h1 className="text-xl font-bold text-red-600">ORDEN DE PUBLICIDAD</h1>
           <p className="text-gray-500 font-bold text-xs">Aire de Santa Fe</p>
        </div>
        <div className="text-right text-xs">
            <p><span className="font-bold">Emisión:</span> {format(new Date(), "dd/MM/yyyy")}</p>
            <p><span className="font-bold">Ejecutivo:</span> {order.accountExecutive}</p>
        </div>
      </header>

      {/* DATOS GENERALES */}
      <div className="mb-4 bg-slate-50 p-2 rounded border border-slate-200 text-xs">
        <div className="grid grid-cols-2 gap-x-4">
            <div className="flex border-b border-slate-200 py-1"><span className="font-bold w-20">Cliente:</span><span className="flex-1">{order.clientName}</span></div>
            <div className="flex border-b border-slate-200 py-1"><span className="font-bold w-20">Agencia:</span><span className="flex-1">{order.agencyName || "-"}</span></div>
            <div className="flex border-b border-slate-200 py-1"><span className="font-bold w-20">Producto:</span><span className="flex-1">{order.opportunityTitle || order.product || "-"}</span></div>
            <div className="flex border-b border-slate-200 py-1"><span className="font-bold w-20">Orden Tango:</span><span className="flex-1">{order.tangoOrderNo || "-"}</span></div>
            <div className="col-span-2 flex py-1"><span className="font-bold w-20">Vigencia:</span><span className="flex-1 font-semibold text-blue-900">{formatDate(order.startDate)} al {formatDate(order.endDate)}</span></div>
        </div>
      </div>

      {/* PAUTA SRL */}
      {srlItems.length > 0 && (
        <div className="mb-8">
            <h3 className="bg-gray-200 p-1 font-bold uppercase mb-2 text-xs border-b-2 border-red-600">PAUTA AIRE SRL</h3>
            
            {/* GRILLAS MENSUALES */}
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
                    <div key={monthKey} className="mb-2 break-inside-avoid">
                        <div className="bg-slate-100 px-2 py-1 font-bold text-[10px] border border-slate-300 border-b-0">
                            {format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase()}
                        </div>
                        <table className="w-full border-collapse text-[8px] border border-slate-300">
                            <thead>
                                <tr className="bg-gray-50 text-center">
                                    <th className="border border-slate-300 p-1 text-left w-24">Programa</th>
                                    <th className="border border-slate-300 p-1 w-12">Tipo</th>
                                    <th className="border border-slate-300 p-1 w-4">TV</th>
                                    <th className="border border-slate-300 p-1 w-6">Seg</th>
                                    {days.map(d => (<th key={d.toISOString()} className="border border-slate-300 w-3 bg-gray-100">{format(d, "d")}</th>))}
                                    <th className="border border-slate-300 p-1 w-8">Cant.</th>
                                    <th className="border border-slate-300 p-1 w-14">Neto</th>
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
                                        <tr key={idx} className="text-center">
                                            <td className="border border-slate-300 p-1 text-left truncate max-w-[100px]">{progName}</td>
                                            <td className="border border-slate-300 p-1 truncate max-w-[50px]">{item.adType}</td>
                                            <td className="border border-slate-300 p-1">{item.hasTv ? 'SI' : ''}</td>
                                            <td className="border border-slate-300 p-1">{item.adType === 'Spot' ? item.seconds : '-'}</td>
                                            {days.map(d => {
                                                const val = dailySpots[format(d, "yyyy-MM-dd")];
                                                return (<td key={d.toISOString()} className={`border border-slate-300 ${val ? 'bg-blue-100 font-bold' : ''}`}>{val || ''}</td>);
                                            })}
                                            <td className="border border-slate-300 p-1 font-bold">{totalAds}</td>
                                            <td className="border border-slate-300 p-1 text-right">${net.toLocaleString('es-AR')}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                );
            })}

            {/* TOTALES SRL */}
            <div style={totalBoxStyle}>
                <div style={totalRowStyle}><span>Subtotal:</span><span>${srlSubtotal.toLocaleString('es-AR')}</span></div>
                <div style={totalRowStyle}><span>Desajuste:</span><span>${srlAdjustment.toLocaleString('es-AR')}</span></div>
                <div style={{...totalRowStyle, fontWeight: 'bold', borderTop: '1px solid #ddd', paddingTop: '2px'}}>
                    <span>Total a Facturar:</span><span>${srlTotalToInvoice.toLocaleString('es-AR')}</span>
                </div>
                <div style={{...totalRowStyle, color: '#666'}}><span>Agencia ({srlCommissionPct}%):</span><span>${srlAgencyAmount.toLocaleString('es-AR')}</span></div>
                <div style={{...totalRowStyle, fontWeight: 'bold', color: 'green'}}>
                    <span>Neto de Acción:</span><span>${srlNetAction.toLocaleString('es-AR')}</span>
                </div>
            </div>
        </div>
      )}

      {/* PAUTA SAS */}
      {sasItems.length > 0 && (
        <div className="mb-4">
            <h3 className="bg-gray-200 p-1 font-bold uppercase mb-2 text-xs border-b-2 border-red-600">PAUTA DIGITAL (SAS)</h3>
            <table className="w-full text-[9px] border-collapse border border-slate-300">
                <thead>
                    <tr className="bg-gray-100 border-b border-slate-300">
                        <th className="p-1 text-left border-r border-slate-300">Formato</th>
                        <th className="p-1 text-left border-r border-slate-300">Detalle</th>
                        <th className="p-1 text-center border-r border-slate-300">Ubicación</th>
                        <th className="p-1 text-left border-r border-slate-300">Observaciones</th>
                        <th className="p-1 text-right">Total Neto</th>
                    </tr>
                </thead>
                <tbody>
                    {sasItems.map((item, i) => {
                        let net = 0;
                        if (item.format === "Banner") { net = (item.cpm || 0) * (item.unitRate || 0); } else { net = (item.unitRate || 0); }
                        const locs = [];
                        if(item.desktop) locs.push("D"); if(item.mobile) locs.push("M"); if(item.home) locs.push("H"); if(item.interiores) locs.push("I");

                        return (
                            <tr key={i} className="border-b border-slate-200">
                                <td className="p-1 border-r border-slate-300">{item.format}</td>
                                <td className="p-1 border-r border-slate-300">{item.detail || item.type || "-"}</td>
                                <td className="p-1 text-center border-r border-slate-300">{locs.join(", ") || "-"}</td>
                                <td className="p-1 italic text-gray-500 max-w-[200px] truncate border-r border-slate-300">{item.observations}</td>
                                <td className="p-1 text-right font-medium">${net.toLocaleString('es-AR')}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* TOTALES SAS */}
            <div style={totalBoxStyle}>
                <div style={totalRowStyle}><span>Subtotal:</span><span>${sasSubtotal.toLocaleString('es-AR')}</span></div>
                <div style={totalRowStyle}><span>Desajuste:</span><span>${sasAdjustment.toLocaleString('es-AR')}</span></div>
                <div style={totalRowStyle}><span>IVA 5%:</span><span>${sasIva.toLocaleString('es-AR')}</span></div>
                <div style={{...totalRowStyle, fontWeight: 'bold', borderTop: '1px solid #ddd', paddingTop: '2px'}}>
                    <span>Total a Facturar:</span><span>${sasTotalToInvoice.toLocaleString('es-AR')}</span>
                </div>
                <div style={{...totalRowStyle, color: '#666'}}><span>Agencia ({sasCommissionPct}%):</span><span>${sasAgencyAmount.toLocaleString('es-AR')}</span></div>
                <div style={{...totalRowStyle, fontWeight: 'bold', color: 'green'}}>
                    <span>Neto de Acción:</span><span>${sasNetAction.toLocaleString('es-AR')}</span>
                </div>
            </div>
        </div>
      )}

      {/* TOTAL GENERAL */}
      <div className="flex justify-end mt-4 pt-2 border-t-2 border-black">
          <div className="text-right text-xs">
              <p className="font-bold text-lg">Total Pedido: ${ (order.totalOrder || 0).toLocaleString('es-AR') }</p>
          </div>
      </div>

      <div className="mt-8 border-t border-black w-64 text-center text-[10px] pt-2">Firma Cliente</div>
    </div>
  );
});

AdvertisingOrderPdf.displayName = 'AdvertisingOrderPdf';
