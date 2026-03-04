'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAdvertisingOrder, getPrograms } from '@/lib/firebase-service';
import type { AdvertisingOrder, Program } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Header } from '@/components/layout/header';
import { ArrowLeft, Copy, Mail, FileDown, Send, Edit, Loader2 } from 'lucide-react'; 
import { Button } from '@/components/ui/button';
import { AdvertisingOrderPdf } from '@/components/publicidad/advertising-pdf';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { sendEmail } from '@/lib/google-gmail-service';
import { format } from 'date-fns';
import { hasManagementPrivileges } from '@/lib/role-utils';

export default function AdvertisingOrderDetailPage() {
    const { id } = useParams();
    const { toast } = useToast();
    const { userInfo, getGoogleAccessToken } = useAuth();
    const [order, setOrder] = useState<AdvertisingOrder | null>(null);
    const [programs, setPrograms] = useState<Program[]>([]);
    const [loading, setLoading] = useState(true);
    const [isResending, setIsResending] = useState(false);
    const [isSendingToRedaccion, setIsSendingToRedaccion] = useState(false);
    const router = useRouter();

    const pdfRef = useRef<HTMLDivElement>(null);
    const hiddenPdfRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const load = async () => {
            if (typeof id === 'string') {
                const [o, p] = await Promise.all([
                    getAdvertisingOrder(id),
                    getPrograms()
                ]);
                setOrder(o);
                setPrograms(p);
            }
            setLoading(false);
        };
        load();
    }, [id]);

    const generatePdf = async (containerElement: HTMLElement) => {
        const pdf = new jsPDF('l', 'mm', 'a4', true); 
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // Buscamos todas las "páginas" generadas por el componente
        const blocks = Array.from(containerElement.querySelectorAll('.pdf-page-block')) as HTMLElement[];

        if (blocks.length === 0) throw new Error("No se encontraron páginas para el PDF");

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            
            // Forzar fondo blanco y escala controlada
            const canvas = await html2canvas(block, { 
                scale: 1.5, 
                useCORS: true, 
                logging: false,
                backgroundColor: '#ffffff' 
            });
            
            const imgData = canvas.toDataURL('image/jpeg', 0.8);
            const ratio = canvas.width / canvas.height;
            const mappedHeight = pdfWidth / ratio;

            if (i > 0) pdf.addPage();
            
            // Agregamos la imagen desde la posición 0,0
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, mappedHeight);

            // Buscar y mapear links en esta página
            const links = block.querySelectorAll('a');
            const elementRect = block.getBoundingClientRect();

            links.forEach((link) => {
                const linkRect = link.getBoundingClientRect();
                if (linkRect.width === 0 || linkRect.height === 0) return;
                
                const topInPx = linkRect.top - elementRect.top;
                const topInMm = (topInPx * mappedHeight) / elementRect.height;
                const left = ((linkRect.left - elementRect.left) * pdfWidth) / elementRect.width;
                const width = (linkRect.width * pdfWidth) / elementRect.width;
                const linkH = (linkRect.height * mappedHeight) / elementRect.height;

                pdf.link(left, topInMm, width, linkH, { url: link.href });
            });
        }

        return pdf;
    }

    const handleExportPdf = async () => {
        if (!pdfRef.current || !order) return;
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
        if (!pdfRef.current || !order) return;
        setIsResending(true);
        try {
            const accessToken = await getGoogleAccessToken();
            if (!accessToken) throw new Error("Sin acceso a Gmail");

            const pdf = await generatePdf(pdfRef.current);
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            
            const oppTitle = order.opportunityTitle || order.product || 'Sin Asignar';
            const baseUrl = window.location.origin;
            const detailLink = `${baseUrl}/publicidad/${order.id}`;
            
            const emailBody = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #1d4ed8;">Orden de Publicidad Reinformada</h2>
                    <p>El ejecutivo <strong>${order.accountExecutive}</strong> ha vuelto a enviar esta orden.</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #1d4ed8; margin: 20px 0;">
                        <p><strong>Cliente:</strong> ${order.clientName || 'Desconocido'}</p>
                        <p><strong>Producto:</strong> ${oppTitle}</p>
                        <p><strong>Vigencia:</strong> ${format(new Date(order.startDate), "dd/MM/yyyy")} al ${format(new Date(order.endDate), "dd/MM/yyyy")}</p>
                    </div>
                    <p>Puede ver el detalle completo y descargar el PDF ingresando al siguiente enlace:</p>
                    <p><a href="${detailLink}">Ver Detalles de la Orden</a></p>
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
            toast({ title: 'Error al enviar el correo.', description: 'Puede que el PDF sea muy pesado. Intente de nuevo.', variant: 'destructive' });
        } finally {
            setIsResending(false);
        }
    };

    const handleSendToRedaccion = async () => {
        if (!hiddenPdfRef.current || !order) return;
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
                to: ['lchena@airedesantafe.com.ar'], 
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

    if (loading) return <div className="flex h-full items-center justify-center"><Spinner size="large" /></div>;
    if (!order) return <div className="p-8 text-center">Orden no encontrada</div>;

    const hasGacetilla = order.sasItems?.some(s => s.format === 'Gacetilla de prensa');
    const canEdit = userInfo && (hasManagementPrivileges(userInfo) || userInfo.id === order.createdBy);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            <Header title={`Orden de Publicidad: ${order.product || order.opportunityTitle}`}>
                <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => router.back()}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                    </Button>
                    
                    {canEdit && (
                        <Button variant="outline" onClick={() => router.push(`/publicidad/new?editId=${order.id}`)}>
                            <Edit className="mr-2 h-4 w-4 text-blue-600" /> Editar
                        </Button>
                    )}

                    {hasGacetilla && (
                        <Button variant="outline" onClick={handleSendToRedaccion} disabled={isSendingToRedaccion} className="text-orange-600 border-orange-200 hover:bg-orange-50">
                            {isSendingToRedaccion ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} 
                            A Redacción
                        </Button>
                    )}
                    
                    <Button variant="outline" onClick={handleReinformar} disabled={isResending}>
                        {isResending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} 
                        Reinformar
                    </Button>
                    
                    <Button variant="outline" onClick={() => router.push(`/publicidad/new?cloneId=${order.id}`)}>
                        <Copy className="mr-2 h-4 w-4" /> Duplicar
                    </Button>
                    
                    <Button variant="outline" onClick={handleExportPdf}>
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} 
                        Exportar PDF
                    </Button>
                </div>
            </Header>
            <main className="flex-1 overflow-auto p-4 md:p-8 flex justify-center w-full bg-slate-200">
                <div className="w-full max-w-5xl">
                    <AdvertisingOrderPdf ref={pdfRef} order={order} programs={programs} />
                </div>
            </main>

            {/* DIV OCULTO PARA EL PDF DE REDACCIÓN SIN PRECIOS */}
            <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
                <AdvertisingOrderPdf ref={hiddenPdfRef} order={order} programs={programs} hidePrices={true} />
            </div>
        </div>
    );
}
