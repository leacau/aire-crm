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
          const page1 = pdfRef.current.querySelector('#ad-pdf-page-1') as HTMLElement;
          const page2 = pdfRef.current.querySelector('#ad-pdf-page-2') as HTMLElement;

          if (!page1) throw new Error("No se encontró la página del PDF");

          const pdf = new jsPDF('l', 'mm', 'a4'); 
          const pdfWidth = pdf.internal.pageSize.getWidth();

          const processPage = async (pageElement: HTMLElement, pageNum: number) => {
              const canvas = await html2canvas(pageElement, { scale: 2, useCORS: true, logging: false });
              const imgData = canvas.toDataURL('image/png');
              const ratio = canvas.width / canvas.height;
              const height = pdfWidth / ratio;

              if (pageNum > 1) pdf.addPage();
              pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, height);

              const links = pageElement.querySelectorAll('a');
              const elementRect = pageElement.getBoundingClientRect();

              links.forEach((link) => {
                  const linkRect = link.getBoundingClientRect();
                  if (linkRect.width === 0 || linkRect.height === 0) return;
                  
                  const top = ((linkRect.top - elementRect.top) * height) / elementRect.height;
                  const left = ((linkRect.left - elementRect.left) * pdfWidth) / elementRect.width;
                  const width = (linkRect.width * pdfWidth) / elementRect.width;
                  const linkH = (linkRect.height * height) / elementRect.height;

                  pdf.link(left, top, width, linkH, { url: link.href });
              });
          };

          await processPage(page1, 1);
          if (page2) await processPage(page2, 2);

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
        <Button variant="outline" size="sm" className="gap-2 bg-white hover:bg-slate-100 text-slate-700 w-full sm:w-auto">
           <FileText className="h-4 w-4" /> Ver y Exportar
        </Button>
      </DialogTrigger>
      {/* 🟢 SE AJUSTÓ max-w-[100vw] PARA QUE DEJE VER LA HOJA APAISADA COMPLETA */}
      <DialogContent className="max-w-[100vw] w-[95vw] md:max-w-5xl max-h-[95vh] overflow-y-auto bg-slate-100">
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

         {/* Contenedor gris simulando el fondo de visor para ver las hojas blancas */}
         <div className="flex justify-center overflow-x-auto rounded-lg shadow-inner bg-slate-200 border border-slate-300 p-4">
            <AdvertisingOrderPdf ref={pdfRef} order={order} programs={programs} />
         </div>
      </DialogContent>
    </Dialog>
  );
}
