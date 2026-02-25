"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Download, Copy, Loader2, Mail, Send } from "lucide-react";
import { AdvertisingOrder, Program } from "@/lib/types";
import { AdvertisingOrderPdf } from "./advertising-pdf";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { sendEmail } from "@/lib/google-gmail-service";

export function AdvertisingOrderViewer({ order, programs = [] }: { order: AdvertisingOrder, programs?: Program[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSendingToRedaccion, setIsSendingToRedaccion] = useState(false);
  const router = useRouter();
  
  const pdfRef = useRef<HTMLDivElement>(null);
  const hiddenPdfRef = useRef<HTMLDivElement>(null); // 🟢 Para el PDF de Redacción
  const { toast } = useToast();
  const { getGoogleAccessToken } = useAuth();

  const generatePdf = async (element: HTMLElement) => {
        const page1 = element.querySelector('#ad-pdf-page-1') as HTMLElement;
        const page2 = element.querySelector('#ad-pdf-page-2') as HTMLElement;

        if (!page1) throw new Error("No se encontró la página del PDF");

        const pdf = new jsPDF('l', 'mm', 'a4'); 
        const pdfWidth = pdf.internal.pageSize.getWidth();

        const processPage = async (pageElement: HTMLElement, pageNum: number) => {
            const canvas = await html2canvas(pageElement, { scale: 1.5, useCORS: true, logging: false });
            const imgData = canvas.toDataURL('image/jpeg', 0.7);
            const ratio = canvas.width / canvas.height;
            const height = pdfWidth / ratio;

            if (pageNum > 1) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, height);

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

        return pdf;
  }

  const handleExportPdf = async () => {
      if (!pdfRef.current) return;
      setIsExporting(true);
      try {
          const pdf = await generatePdf(pdfRef.current);
          pdf.save(`OP-${order.clientName}-${format(new Date(), 'yyyyMMdd')}.pdf`);
          toast({ title: "PDF Exportado correctamente." });
      } catch (err) {
          console.error(err);
          toast({ title: "Error al generar PDF", variant: "destructive" });
      } finally {
          setIsExporting(false);
      }
  };

  const handleReinformar = async () => {
        if (!pdfRef.current) return;
        setIsResending(true);
        try {
            const accessToken = await getGoogleAccessToken();
            if (!accessToken) {
                toast({ title: "Error", description: "No se pudo obtener acceso a Gmail.", variant: "destructive" });
                setIsResending(false);
                return;
            }

            const pdf = await generatePdf(pdfRef.current);
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            
            const oppTitle = order.opportunityTitle || order.product || 'Sin Asignar';
            const baseUrl = window.location.origin;
            const detailLink = `${baseUrl}/publicidad`;
            
            const emailBody = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #1d4ed8;">Orden de Publicidad Reinformada</h2>
                    <p>El ejecutivo <strong>${order.accountExecutive}</strong> ha vuelto a enviar esta orden.</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #1d4ed8; margin: 20px 0;">
                        <p><strong>Cliente:</strong> ${order.clientName || 'Desconocido'}</p>
                        <p><strong>Producto:</strong> ${oppTitle}</p>
                        <p><strong>Vigencia:</strong> ${format(new Date(order.startDate), "dd/MM/yyyy")} al ${format(new Date(order.endDate), "dd/MM/yyyy")}</p>
                    </div>
                    <p>Puede ver el listado de órdenes y buscar el detalle ingresando al siguiente enlace:</p>
                    <p><a href="${detailLink}">Ver Órdenes de Publicidad</a></p>
                </div>
            `;

            await sendEmail({
                accessToken,
                to: ['lchena@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'materiales@airedesantafe.com.ar'], 
                subject: `Reinforme - OP: ${oppTitle} - ${order.clientName}`,
                body: emailBody,
                attachments: [{
                    filename: `OP_${oppTitle.replace(/ /g, "_")}.pdf`,
                    content: pdfBase64,
                    encoding: 'base64'
                }]
            });
            
            toast({ title: 'Orden reinformada exitosamente.' });
        } catch (error) {
            console.error("Error al reinformar", error);
            toast({ title: 'Error al enviar el correo.', variant: 'destructive' });
        } finally {
            setIsResending(false);
        }
  };

  // 🟢 LÓGICA DE ENVÍO A REDACCIÓN MOVIDA AQUÍ
  const handleSendToRedaccion = async () => {
      if (!hiddenPdfRef.current) return;
      setIsSendingToRedaccion(true);
      try {
          const accessToken = await getGoogleAccessToken();
          if (!accessToken) throw new Error("Sin acceso a Gmail");

          const pdf = await generatePdf(hiddenPdfRef.current);
          const pdfBase64 = pdf.output('datauristring').split(',')[1];

          const emailBody = `
              <div style="font-family: Arial, sans-serif; color: #333;">
                  <h2 style="color: #ea580c;">Nueva Gacetilla de Prensa</h2>
                  <p>Se solicita publicación para el cliente <strong>${order.clientName}</strong>.</p>
                  <p>Por favor revise el PDF adjunto con las instrucciones y el link a los materiales.</p>
              </div>
          `;

          await sendEmail({
              accessToken,
              to: ['lchena@airedesantafe.com.ar'], // Redacción
              subject: `Gacetilla de Prensa: ${order.clientName}`,
              body: emailBody,
              attachments: [{
                  filename: `Gacetilla_${order.clientName?.replace(/ /g, "_")}.pdf`,
                  content: pdfBase64,
                  encoding: 'base64'
              }]
          });

          toast({ title: 'Enviado a Redacción exitosamente.' });
      } catch (error) {
          console.error(error);
          toast({ title: 'Error al enviar a redacción.', variant: 'destructive' });
      } finally {
          setIsSendingToRedaccion(false);
      }
  };

  const hasGacetilla = order.sasItems?.some(s => s.format === 'Gacetilla de prensa');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-white hover:bg-slate-100 text-slate-700 w-full sm:w-auto">
           <FileText className="h-4 w-4" /> Ver y Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[100vw] w-[95vw] md:max-w-5xl max-h-[95vh] overflow-y-auto bg-slate-100">
         <DialogTitle className="sr-only">Visor de Orden de Publicidad</DialogTitle>
         <DialogDescription className="sr-only">Detalles y exportación de la orden de publicidad</DialogDescription>
         
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-slate-300 pb-4 gap-4 sticky top-0 bg-slate-100 z-10 pt-4">
             <h2 className="text-2xl font-bold text-slate-800">Orden de Publicidad</h2>
             <div className="flex flex-wrap gap-2">
                 
                 {/* 🟢 BOTÓN DE REDACCIÓN TRASLADADO AL VISOR */}
                 {hasGacetilla && (
                    <Button variant="outline" onClick={handleSendToRedaccion} disabled={isSendingToRedaccion} className="bg-white text-orange-600 border-orange-200 hover:bg-orange-50">
                        {isSendingToRedaccion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} 
                        {isSendingToRedaccion ? 'Enviando...' : 'A Redacción'}
                    </Button>
                 )}

                 <Button variant="outline" onClick={handleReinformar} disabled={isResending} className="bg-white">
                    {isResending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} 
                    {isResending ? 'Enviando...' : 'Reinformar'}
                 </Button>
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

         {/* 🟢 DIV OCULTO PARA EL PDF DE REDACCIÓN SIN PRECIOS */}
         <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
             <AdvertisingOrderPdf ref={hiddenPdfRef} order={order} programs={programs} hidePrices={true} />
         </div>
      </DialogContent>
    </Dialog>
  );
}
