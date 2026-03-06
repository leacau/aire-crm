"use client";

import { useState, useEffect, useRef } from "react";
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
import { getBillingRequestsByOrder } from "@/lib/firebase-service";

export function AdvertisingOrderViewer({ order, programs = [] }: { order: AdvertisingOrder, programs?: Program[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSendingToRedaccion, setIsSendingToRedaccion] = useState(false);
  
  const [fullOrder, setFullOrder] = useState<AdvertisingOrder>(order);

  const router = useRouter();
  
  const pdfRef = useRef<HTMLDivElement>(null);
  const hiddenPdfRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { getGoogleAccessToken } = useAuth();

  useEffect(() => {
        setFullOrder(order);
        if (isOpen && order.id) {
            getBillingRequestsByOrder(order.id).then(brs => {
                const billingSrl: any[] = [];
                const billingSas: any[] = [];

                brs.forEach(b => {
                    const mapped = { 
                        date: b.date, 
                        grossAmount: b.grossAmount || 0,
                        adjustment: b.adjustment || 0,
                        amount: b.amount || 0 
                    };

                    if (b.company === 'SRL') {
                        billingSrl.push(mapped);
                    } else if (b.company === 'SAS') {
                        billingSas.push({ ...mapped, ivaSas: b.ivaSas || 0 });
                    }
                });

                setFullOrder(prev => ({ 
                    ...prev, 
                    billingRequestsSrl: billingSrl,
                    billingRequestsSas: billingSas
                }));
            });
        }
  }, [isOpen, order]);

  const generatePdf = async (containerElement: HTMLElement) => {
        const pdf = new jsPDF('l', 'mm', 'a4', true); 
        const pdfWidthMm = 297;
        const pdfHeightMm = 210;

        const topPaddingMm = 15;
        const bottomPaddingMm = 15;
        const usableHeightMm = pdfHeightMm - topPaddingMm - bottomPaddingMm;

        const domWidthPx = containerElement.offsetWidth;
        const mmToPx = domWidthPx / pdfWidthMm;
        const pageHeightPx = pdfHeightMm * mmToPx;
        const usableHeightPx = usableHeightMm * mmToPx;
        const topPaddingPx = topPaddingMm * mmToPx;

        const blocks = Array.from(containerElement.querySelectorAll('.pdf-block')) as HTMLElement[];
        
        blocks.forEach(b => b.style.marginTop = '0px');
        void containerElement.offsetHeight;

        let absoluteY = topPaddingPx;
        let currentPageIndex = 0;

        blocks.forEach((block) => {
            const blockHeight = block.offsetHeight;
            const blockMarginBottom = parseFloat(window.getComputedStyle(block).marginBottom) || 0;
            const totalBlockHeight = blockHeight + blockMarginBottom;

            const pageBottomLimit = (currentPageIndex * pageHeightPx) + topPaddingPx + usableHeightPx;

            if (absoluteY + totalBlockHeight > pageBottomLimit && currentPageIndex >= 0) {
                currentPageIndex++;
                const targetY = (currentPageIndex * pageHeightPx) + topPaddingPx;
                const marginToAdd = targetY - absoluteY;
                
                block.style.marginTop = `${marginToAdd}px`;
                absoluteY = targetY + totalBlockHeight;
            } else {
                absoluteY += totalBlockHeight;
            }
        });

        const canvas = await html2canvas(containerElement, { 
            scale: 1.5, 
            useCORS: true, 
            logging: false,
            backgroundColor: '#ffffff' 
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const ratio = canvas.width / canvas.height;
        const mappedHeight = pdfWidthMm / ratio;

        let heightLeft = mappedHeight;
        let position = 0;
        let currentPage = 1;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidthMm, mappedHeight);
        heightLeft -= pdfHeightMm;

        while (heightLeft > 0) {
            position -= pdfHeightMm;
            pdf.addPage();
            currentPage++;
            pdf.addImage(imgData, 'JPEG', 0, position, pdfWidthMm, mappedHeight);
            heightLeft -= pdfHeightMm;
        }

        const links = containerElement.querySelectorAll('a');
        const elementRect = containerElement.getBoundingClientRect();

        links.forEach((link) => {
            const linkRect = link.getBoundingClientRect();
            if (linkRect.width === 0 || linkRect.height === 0) return;
            
            const topInPx = linkRect.top - elementRect.top;
            const topInMm = (topInPx * mappedHeight) / elementRect.height;
            const sliceIndex = Math.floor(topInMm / pdfHeightMm);
            const topOnPage = topInMm - (sliceIndex * pdfHeightMm);

            const left = ((linkRect.left - elementRect.left) * pdfWidthMm) / elementRect.width;
            const width = (linkRect.width * pdfWidthMm) / elementRect.width;
            const linkH = (linkRect.height * mappedHeight) / elementRect.height;

            pdf.setPage(sliceIndex + 1);
            pdf.link(left, topOnPage, width, linkH, { url: link.href });
        });

        return pdf;
  }

  const handleExportPdf = async () => {
      if (!pdfRef.current) return;
      setIsExporting(true);
      try {
          const pdf = await generatePdf(pdfRef.current);
          pdf.save(`OP-${fullOrder.clientName}-${format(new Date(), 'yyyyMMdd')}.pdf`);
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
            
            const oppTitle = fullOrder.opportunityTitle || fullOrder.product || 'Sin Asignar';
            const baseUrl = window.location.origin;
            const detailLink = `${baseUrl}/publicidad`;
            
            const emailBody = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #1d4ed8;">Orden de Publicidad Reinformada</h2>
                    <p>El ejecutivo <strong>${fullOrder.accountExecutive}</strong> ha vuelto a enviar esta orden.</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #1d4ed8; margin: 20px 0;">
                        <p><strong>Cliente:</strong> ${fullOrder.clientName || 'Desconocido'}</p>
                        <p><strong>Producto:</strong> ${oppTitle}</p>
                        <p><strong>Vigencia:</strong> ${format(new Date(fullOrder.startDate), "dd/MM/yyyy")} al ${format(new Date(fullOrder.endDate), "dd/MM/yyyy")}</p>
                    </div>
                    <p>Puede ver el listado de órdenes y buscar el detalle ingresando al siguiente enlace:</p>
                    <p><a href="${detailLink}">Ver Órdenes de Publicidad</a></p>
                </div>
            `;

            await sendEmail({
                accessToken,
                to: ['lchena@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'materiales@airedesantafe.com.ar'], 
                subject: `Reinforme - OP: ${oppTitle} - ${fullOrder.clientName}`,
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
                  <p>Se solicita publicación para el cliente <strong>${fullOrder.clientName}</strong>.</p>
                  <p>Por favor revise el PDF adjunto con las instrucciones y el link a los materiales.</p>
              </div>
          `;

          await sendEmail({
              accessToken,
              to: ['lchena@airedesantafe.com.ar'], // Redacción
              subject: `Gacetilla de Prensa: ${fullOrder.clientName}`,
              body: emailBody,
              attachments: [{
                  filename: `Gacetilla_${fullOrder.clientName?.replace(/ /g, "_")}.pdf`,
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

  const hasGacetilla = fullOrder.sasItems?.some(s => s.format === 'Gacetilla de prensa');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-white hover:bg-slate-100 text-slate-700 w-full sm:w-auto">
           <FileText className="h-4 w-4" /> Ver y Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[100vw] w-[95vw] md:max-w-5xl max-h-[95vh] overflow-y-auto bg-slate-200 p-0 border-0">
         <DialogTitle className="sr-only">Visor de Orden de Publicidad</DialogTitle>
         <DialogDescription className="sr-only">Detalles y exportación de la orden de publicidad</DialogDescription>
         
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-slate-300 p-4 gap-4 sticky top-0 bg-white z-10 shadow-sm">
             <h2 className="text-2xl font-bold text-slate-800">Orden de Publicidad</h2>
             <div className="flex flex-wrap gap-2">
                 
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
                 <Button variant="outline" onClick={() => { setIsOpen(false); router.push(`/publicidad/new?cloneId=${fullOrder.id}`); }} className="bg-white">
                    <Copy className="mr-2 h-4 w-4" /> Duplicar Orden
                 </Button>
                 <Button onClick={handleExportPdf} disabled={isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} 
                    {isExporting ? 'Generando...' : 'Descargar PDF'}
                 </Button>
             </div>
         </div>

         <div className="flex justify-center overflow-x-auto w-full p-4">
            <div className="w-full max-w-5xl">
                <AdvertisingOrderPdf ref={pdfRef} order={fullOrder} programs={programs} />
            </div>
         </div>

         <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
             <AdvertisingOrderPdf ref={hiddenPdfRef} order={fullOrder} programs={programs} hidePrices={true} />
         </div>
      </DialogContent>
    </Dialog>
  );
}
