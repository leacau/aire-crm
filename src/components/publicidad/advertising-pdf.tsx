//src/components/publicidad/advertising-pdf.tsx

import React, { forwardRef } from 'react';
import { AdvertisingOrder, Program } from '@/lib/types';
import { format, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns';
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
  
  // Rango de fechas para generar las tablas mensuales
  const startDate = order.startDate ? new Date(order.startDate) : new Date();
  const endDate = order.endDate ? new Date(order.endDate) : new Date();
  
  // Evitamos errores si las fechas son inválidas o inversas
  let months: Date[] = [];
  try {
      if (startDate <= endDate) {
          months = eachMonthOfInterval({ start: startDate, end: endDate });
      }
  } catch (e) {
      months = [new Date()];
  }

  // Estilos fijos para hoja A4
  const pageStyle: React.CSSProperties = {
    width: '210mm',
    minHeight: '297mm',
    padding: '10mm', // Margen reducido para que entre la grilla
    backgroundColor: 'white',
    fontFamily: 'Arial, sans-serif',
    color: '#000',
    position: 'relative',
    boxSizing: 'border-box',
    fontSize: '10px', // Fuente base más chica
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
            <div className="flex border-b border-slate-200 py-1">
                <span className="font-bold w-20">Cliente:</span>
                <span className="flex-1">{order.clientName}</span>
            </div>
            <div className="flex border-b border-slate-200 py-1">
                <span className="font-bold w-20">Agencia:</span>
                <span className="flex-1">{order.agencyName || "-"}</span>
            </div>
            <div className="flex border-b border-slate-200 py-1">
                <span className="font-bold w-20">Producto:</span>
                <span className="flex-1">{order.opportunityTitle || order.product || "-"}</span>
            </div>
            <div className="flex border-b border-slate-200 py-1">
                <span className="font-bold w-20">Orden Tango:</span>
                <span className="flex-1">{order.tangoOrderNo || "-"}</span>
            </div>
            <div className="col-span-2 flex py-1">
                <span className="font-bold w-20">Vigencia:</span>
                <span className="flex-1 font-semibold text-blue-900">
                    {formatDate(order.startDate)} al {formatDate(order.endDate)}
                </span>
            </div>
        </div>
      </div>

      {/* PAUTA SRL - GRILLAS MENSUALES */}
      {srlItems.length > 0 && (
        <div className="mb-6">
            <h3 className="bg-gray-200 p-1 font-bold uppercase mb-2 text-xs border-b-2 border-red-600">
                PAUTA AIRE SRL
            </h3>
            
            {months.map((monthDate) => {
                const monthKey = format(monthDate, "yyyy-MM");
                
                // Filtramos items que pertenecen a este mes
                const itemsInMonth = srlItems.filter(item => item.month === monthKey);
                if (itemsInMonth.length === 0) return null;

                // Generamos días del mes para el encabezado
                const mStart = startOfMonth(monthDate);
                const mEnd = endOfMonth(monthDate);
                // Ajustamos al rango real del pedido si el mes es el de inicio o fin
                const effectiveStart = mStart < startDate ? startDate : mStart;
                const effectiveEnd = mEnd > endDate ? endDate : mEnd;
                
                const days = eachDayOfInterval({ start: effectiveStart, end: effectiveEnd });

                return (
                    <div key={monthKey} className="mb-4 break-inside-avoid">
                        <div className="bg-slate-100 px-2 py-1 font-bold text-xs border border-slate-300 border-b-0">
                            {format(monthDate, "MMMM yyyy", { locale: es }).toUpperCase()}
                        </div>
                        <table className="w-full border-collapse text-[9px] border border-slate-300">
                            <thead>
                                <tr className="bg-gray-50 text-center">
                                    <th className="border border-slate-300 p-1 text-left w-32">Programa</th>
                                    <th className="border border-slate-300 p-1 w-16">Tipo</th>
                                    <th className="border border-slate-300 p-1 w-6">TV</th>
                                    <th className="border border-slate-300 p-1 w-8">Seg</th>
                                    {days.map(d => (
                                        <th key={d.toISOString()} className="border border-slate-300 w-4 bg-gray-100">
                                            {format(d, "d")}
                                        </th>
                                    ))}
                                    <th className="border border-slate-300 p-1 w-10">Cant.</th>
                                    <th className="border border-slate-300 p-1 w-16">Neto</th>
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
                                            <td className="border border-slate-300 p-1 text-left font-medium truncate max-w-[120px]">
                                                {progName}
                                            </td>
                                            <td className="border border-slate-300 p-1">{item.adType}</td>
                                            <td className="border border-slate-300 p-1">{item.hasTv ? 'SI' : ''}</td>
                                            <td className="border border-slate-300 p-1">{item.adType === 'Spot' ? item.seconds : '-'}</td>
                                            
                                            {days.map(d => {
                                                const dateKey = format(d, "yyyy-MM-dd");
                                                const val = dailySpots[dateKey];
                                                return (
                                                    <td key={dateKey} className={`border border-slate-300 ${val ? 'bg-blue-100 font-bold' : ''}`}>
                                                        {val || ''}
                                                    </td>
                                                );
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
        </div>
      )}

      {/* PAUTA SAS */}
      {sasItems.length > 0 && (
        <div className="mb-4 break-inside-avoid">
            <h3 className="bg-gray-200 p-1 font-bold uppercase mb-2 text-xs border-b-2 border-red-600">
                PAUTA DIGITAL (SAS)
            </h3>
            <table className="w-full text-[10px] border-collapse border border-slate-300">
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
                        if (item.format === "Banner") {
                            net = (item.cpm || 0) * (item.unitRate || 0);
                        } else {
                            net = (item.unitRate || 0);
                        }

                        const locs = [];
                        if(item.desktop) locs.push("D");
                        if(item.mobile) locs.push("M");
                        if(item.home) locs.push("H");
                        if(item.interiores) locs.push("I");

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
        </div>
      )}

      {/* TOTALES */}
      <div className="flex justify-end mt-2 pt-2 border-t-2 border-black break-inside-avoid">
          <div className="text-right text-sm">
              <p className="font-bold">Total Pedido: ${ (order.totalOrder || 0).toLocaleString('es-AR') }</p>
          </div>
      </div>

      <div className="mt-12 border-t border-black w-64 text-center text-xs pt-2">
          Firma Cliente
      </div>

    </div>
  );
});

AdvertisingOrderPdf.displayName = 'AdvertisingOrderPdf';
