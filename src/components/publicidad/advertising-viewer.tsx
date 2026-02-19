"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Download, Copy, Loader2 } from "lucide-react";
import { AdvertisingOrder, Program } from "@/lib/types";
import { AdvertisingOrderPdf } from "./advertising-pdf";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useToast } from "@/hooks/use-toast";

export function AdvertisingOrderViewer({ order, programs = [] }: { order: AdvertisingOrder, programs?: Program[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();
  const pdfRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleExportPdf = async () => {
      if (!pdfRef.current) return;
      setIsExporting(true);
      try {
          const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, logging: false });
          const imgData = canvas.toDataURL('image/png');
          
          // 🟢 CAMBIADO A 'l' (Landscape)
          const pdf = new jsPDF('l', 'mm', 'a4');
          
          const pdfWidth = pdf.internal.pageSize.getWidth();
          
          const imgProps = pdf.getImageProperties(imgData);
          const ratio = imgProps.width / imgProps.height;
          const heightCalculated = pdfWidth / ratio;

          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, heightCalculated);
          pdf.save(`OP-${order.clientName}-${format(new Date(), 'yyyyMMdd')}.pdf`);
          toast({ title: "PDF Exportado correctamente." });
      } catch (err) {
          console.error(err);
          toast({ title: "Error al generar PDF", variant: "destructive" });
      } finally {
          setIsExporting(false);
      }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-white hover:bg-slate-100 text-slate-700">
           <FileText className="h-4 w-4" /> Ver y Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto bg-slate-100">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-slate-300 pb-4 gap-4 sticky top-0 bg-slate-100 z-10 pt-4">
             <h2 className="text-2xl font-bold text-slate-800">Orden de Publicidad</h2>
             <div className="flex gap-2">
                 <Button variant="outline" onClick={() => { setIsOpen(false); router.push(`/publicidad/new?cloneId=${order.id}`); }} className="bg-white">
                    <Copy className="mr-2 h-4 w-4" /> Duplicar Orden
                 </Button>
                 <Button onClick={handleExportPdf} disabled={isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} 
                    {isExporting ? 'Generando...' : 'Descargar PDF'}
                 </Button>
             </div>
         </div>

         {/* Contenedor visible */}
         <div className="flex justify-center overflow-x-auto rounded-lg shadow-xl border border-slate-200 bg-white">
            <AdvertisingOrderPdf ref={pdfRef} order={order} programs={programs} />
         </div>
      </DialogContent>
    </Dialog>
  );
}
