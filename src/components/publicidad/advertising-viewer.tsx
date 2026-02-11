"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { AdvertisingOrder } from "@/lib/types";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { AdvertisingOrderPdf } from "./advertising-pdf";
import { format } from "date-fns";

export function AdvertisingOrderViewer({ order }: { order: AdvertisingOrder }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
           <FileText className="h-4 w-4" /> Ver Orden Publicidad
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
         <div className="flex justify-between items-center mb-4 border-b pb-2">
             <h2 className="text-2xl font-bold">Orden de Publicidad</h2>
             <PDFDownloadLink document={<AdvertisingOrderPdf order={order} />} fileName={`OP-${order.clientName}-${format(new Date(), 'yyyyMMdd')}.pdf`}>
                {({ loading }) => (
                    <Button disabled={loading}>
                        <Download className="mr-2 h-4 w-4" /> {loading ? 'Generando...' : 'Descargar PDF'}
                    </Button>
                )}
             </PDFDownloadLink>
         </div>

         <div className="space-y-6">
             {/* Aquí replicamos la vista de solo lectura del formulario */}
             <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded">
                 <div><strong>Cliente:</strong> {order.clientName}</div>
                 <div><strong>Campaña/Producto:</strong> {order.opportunityTitle || order.product}</div>
                 <div><strong>Vigencia:</strong> {format(new Date(order.startDate), "dd/MM/yyyy")} - {format(new Date(order.endDate), "dd/MM/yyyy")}</div>
                 <div><strong>Ejecutivo:</strong> {order.accountExecutive}</div>
             </div>
             
             {/* Resumen SRL Items */}
             <div>
                 <h3 className="font-bold mb-2">Pauta SRL</h3>
                 <div className="border rounded">
                     {/* Tabla simple de solo lectura */}
                     <table className="w-full text-sm text-left">
                         <thead className="bg-slate-100">
                             <tr>
                                 <th className="p-2">Mes</th>
                                 <th className="p-2">Programa</th>
                                 <th className="p-2">Tipo</th>
                                 <th className="p-2">TV</th>
                                 <th className="p-2 text-right">Tarifa</th>
                             </tr>
                         </thead>
                         <tbody>
                             {order.srlItems.map((item, idx) => (
                                 <tr key={idx} className="border-t">
                                     <td className="p-2">{item.month}</td>
                                     <td className="p-2">{item.programId}</td>
                                     <td className="p-2">{item.adType}</td>
                                     <td className="p-2">{item.hasTv ? 'SI' : 'NO'}</td>
                                     <td className="p-2 text-right">${item.unitRate}</td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
             </div>
         </div>
      </DialogContent>
    </Dialog>
  );
}
