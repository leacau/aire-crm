//src/components/publicidad/advertising-pdf.tsx

import React, { forwardRef } from 'react';
import { AdvertisingOrder } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdvertisingOrderPdfProps {
  order: AdvertisingOrder;
}

export const AdvertisingOrderPdf = forwardRef<HTMLDivElement, AdvertisingOrderPdfProps>(({ order }, ref) => {
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
  
  // Estilos fijos para hoja A4
  const pageStyle: React.CSSProperties = {
    width: '210mm',
    minHeight: '297mm',
    padding: '15mm', // Un poco menos de margen para que entre la tabla
    backgroundColor: 'white',
    fontFamily: 'Arial, sans-serif',
    color: '#000',
    position: 'relative',
    boxSizing: 'border-box'
  };

  return (
    <div ref={ref} style={pageStyle} className="text-sm">
      
      {/* HEADER */}
      <header className="flex justify-between items-center mb-6 border-b-2 border-slate-300 pb-4">
        <div>
           {/* Logo placeholder o texto */}
           <h1 className="text-2xl font-bold text-red-600">ORDEN DE PUBLICIDAD</h1>
           <p className="text-gray-500 font-bold">Aire de Santa Fe</p>
        </div>
        <div className="text-right text-xs">
            <p><span className="font-bold">Fecha Emisión:</span> {format(new Date(), "dd/MM/yyyy")}</p>
            <p><span className="font-bold">Ejecutivo:</span> {order.accountExecutive}</p>
        </div>
      </header>

      {/* DATOS GENERALES */}
      <div className="mb-6 bg-slate-50 p-4 rounded border border-slate-200">
        <div className="grid grid-cols-2 gap-y-2 gap-x-8">
            <div className="flex border-b border-slate-200 pb-1">
                <span className="font-bold w-24">Cliente:</span>
                <span className="flex-1">{order.clientName}</span>
            </div>
            <div className="flex border-b border-slate-200 pb-1">
                <span className="font-bold w-24">Agencia:</span>
                <span className="flex-1">{order.agencyName || "-"}</span>
            </div>
            <div className="flex border-b border-slate-200 pb-1">
                <span className="font-bold w-24">Producto:</span>
                <span className="flex-1">{order.opportunityTitle || order.product || "-"}</span>
            </div>
            <div className="flex border-b border-slate-200 pb-1">
                <span className="font-bold w-24">Orden Tango:</span>
                <span className="flex-1">{order.tangoOrderNo || "-"}</span>
            </div>
            <div className="col-span-2 flex border-b border-slate-200 pb-1">
                <span className="font-bold w-24">Vigencia:</span>
                <span className="flex-1 font-semibold text-blue-900">
                    {formatDate(order.startDate)} al {formatDate(order.endDate)}
                </span>
            </div>
        </div>
      </div>

      {/* PAUTA SRL */}
      {srlItems.length > 0 && (
        <div className="mb-8">
            <h3 className="bg-gray-200 p-2 font-bold uppercase mb-2 text-xs border-b-2 border-red-600">
                PAUTA AIRE SRL
            </h3>
            <table className="w-full text-xs border-collapse">
                <thead>
                    <tr className="bg-gray-100 border-b border-gray-300">
                        <th className="p-2 text-left w-1/3">Programa</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-center">TV</th>
                        <th className="p-2 text-center">Mes</th>
                        <th className="p-2 text-right">Total Neto</th>
                    </tr>
                </thead>
                <tbody>
                    {srlItems.map((item, i) => {
                        const dailySpots = item.dailySpots || {}; 
                        const totalAds = Object.values(dailySpots).reduce((a, b) => a + (Number(b) || 0), 0);
                        const mult = item.adType === 'Spot' ? (item.seconds || 0) : 1;
                        const net = (item.unitRate || 0) * totalAds * mult;
                        
                        return (
                            <tr key={i} className="border-b border-gray-100">
                                <td className="p-2">{item.programId}</td>
                                <td className="p-2">{item.adType}</td>
                                <td className="p-2 text-center">{item.hasTv ? 'SI' : 'NO'}</td>
                                <td className="p-2 text-center">{item.month}</td>
                                <td className="p-2 text-right font-medium">${net.toLocaleString('es-AR')}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      )}

      {/* PAUTA SAS */}
      {sasItems.length > 0 && (
        <div className="mb-8">
            <h3 className="bg-gray-200 p-2 font-bold uppercase mb-2 text-xs border-b-2 border-red-600">
                PAUTA DIGITAL (SAS)
            </h3>
            <table className="w-full text-xs border-collapse">
                <thead>
                    <tr className="bg-gray-100 border-b border-gray-300">
                        <th className="p-2 text-left">Formato</th>
                        <th className="p-2 text-left">Detalle</th>
                        <th className="p-2 text-center">Ubicación</th>
                        <th className="p-2 text-left">Obs</th>
                        <th className="p-2 text-right">Total Neto</th>
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
                            <tr key={i} className="border-b border-gray-100">
                                <td className="p-2">{item.format}</td>
                                <td className="p-2">{item.detail || item.type || "-"}</td>
                                <td className="p-2 text-center">{locs.join(", ") || "-"}</td>
                                <td className="p-2 italic text-gray-500 max-w-[150px] truncate">{item.observations}</td>
                                <td className="p-2 text-right font-medium">${net.toLocaleString('es-AR')}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      )}

      {/* TOTALES */}
      <div className="flex justify-end mt-4 pt-4 border-t-2 border-black">
          <div className="text-right">
              <p className="text-xl font-bold">Total Pedido: ${ (order.totalOrder || 0).toLocaleString('es-AR') }</p>
          </div>
      </div>

      <div className="mt-20 border-t border-black w-64 text-center text-xs pt-2">
          Firma Cliente
      </div>

    </div>
  );
});

AdvertisingOrderPdf.displayName = 'AdvertisingOrderPdf';
