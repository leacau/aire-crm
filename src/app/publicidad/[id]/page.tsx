'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAdvertisingOrder, getPrograms, getBillingRequestsByOrder, getSocialMediaRequests, getAllCommercialNotes, getWebNotes } from '@/lib/firebase-service';
import type { AdvertisingOrder, Program, CommercialNote, SocialMediaRequest, WebNote } from '@/lib/types';
import { Spinner } from '@/components/ui/spinner';
import { Header } from '@/components/layout/header';
import { ArrowLeft, Copy, Mail, FileDown, Send, Edit, Loader2, Film, Share2, Eye, Globe, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdvertisingOrderPdf } from '@/components/publicidad/advertising-pdf';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { sendEmail } from '@/lib/google-gmail-service';
import { format } from 'date-fns';
import { hasManagementPrivileges } from '@/lib/role-utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isSocialMediaSasItem } from '@/lib/advertising-order-utils';
import { AdvertisingRevisionHistory } from '@/components/publicidad/advertising-revision-history';

export default function AdvertisingOrderDetailPage() {
    const { id } = useParams();
    const { toast } = useToast();
    const { userInfo, getGoogleAccessToken } = useAuth();
    
    const [order, setOrder] = useState<AdvertisingOrder | null>(null);
    const [programs, setPrograms] = useState<Program[]>([]);
    
    const [linkedNotes, setLinkedNotes] = useState<CommercialNote[]>([]);
    const [linkedSocial, setLinkedSocial] = useState<SocialMediaRequest[]>([]);
    const [linkedWebNotes, setLinkedWebNotes] = useState<WebNote[]>([]);
    
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [isSendingToRedaccion, setIsSendingToRedaccion] = useState(false);
    
    const router = useRouter();

    const pdfRef = useRef<HTMLDivElement>(null);
    const hiddenPdfRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const load = async () => {
            if (typeof id === 'string') {
                const [o, p, brs, allNotes, allSocial, allWebNotes] = await Promise.all([
                    getAdvertisingOrder(id),
                    getPrograms(),
                    getBillingRequestsByOrder(id),
                    getAllCommercialNotes(),
                    getSocialMediaRequests(),
                    getWebNotes() 
                ]);
                
                if (o) {
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

                    o.billingRequestsSrl = billingSrl;
                    o.billingRequestsSas = billingSas;
                    
                    setOrder(o);

                    setLinkedNotes(allNotes.filter(n => n.orderId === id));
                    setLinkedSocial(allSocial.filter(s => s.orderId === id));
                    setLinkedWebNotes(allWebNotes.filter(w => w.orderId === id));
                }
                setPrograms(p);
            }
            setLoading(false);
        };
        load();
    }, [id]);

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

        const canvas = await html2canvas(containerElement, { scale: 1.5, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const ratio = canvas.width / canvas.height;
        const mappedHeight = pdfWidthMm / ratio;

        let heightLeft = mappedHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidthMm, mappedHeight);
        heightLeft -= pdfHeightMm;

        while (heightLeft > 0) {
            position -= pdfHeightMm;
            pdf.addPage();
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
            toast({ title: 'Error al enviar el correo.', variant: 'destructive' });
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

    const canEdit = userInfo && (hasManagementPrivileges(userInfo) || userInfo.id === order.createdBy);

    // 🟢 EL CANDADO DE SEGURIDAD
    const isOrderApproved = !order.status || order.status === 'Aprobado';
    const canCreateUnplannedExecutions = !!userInfo && hasManagementPrivileges(userInfo);

    // 🟢 DOBLE CANDADO: LÓGICA DE DETECCIÓN DE PRODUCTOS EN LA PAUTA
    const hasSrlNota = order.srlItems?.some(i => (i.adType || '').toLowerCase().includes('nota'));
    const hasSasNotaWeb = order.sasItems?.some(i => {
        const fmt = (i.format || '').toLowerCase();
        return fmt.includes('nota') || fmt.includes('gacetilla');
    });
    const hasSasRedes = order.sasItems?.some(isSocialMediaSasItem);
    
    // Lo conservamos para el botón de enviar a redacción
    const hasGacetilla = order.sasItems?.some(s => s.format === 'Gacetilla de prensa');

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
            <main className="flex-1 overflow-auto p-4 md:p-8 w-full bg-slate-200">
                <div className="w-full max-w-5xl mx-auto space-y-6">
                    
                    <AdvertisingOrderPdf ref={pdfRef} order={order} programs={programs} />

                    {((order.revisionHistory?.length || 0) > 0 || (order.approvalHistory?.length || 0) > 0) && (
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-300">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 border-b pb-4 mb-4">
                                <History className="h-5 w-5" /> Historial completo de la orden
                            </h3>

                            <AdvertisingRevisionHistory order={order} programs={programs} />

                            {(order.approvalHistory?.length || 0) > 0 && (
                                <div className="mt-5 space-y-2 border-t pt-4">
                                    <h4 className="font-semibold text-slate-800">Circuito de aprobación</h4>
                                    {order.approvalHistory?.map((item, historyIndex) => (
                                        <div key={`${item.timestamp}-${historyIndex}`} className="flex flex-wrap items-center gap-2 text-sm border-b py-2 last:border-0">
                                            <span className="font-medium">{item.timestamp}</span>
                                            <span>{item.userName}</span>
                                            <Badge variant="outline">{item.status}</Badge>
                                            {item.comments && <span className="w-full text-slate-600">{item.comments}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    
                    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-300">
                        <div className="flex justify-between items-center border-b pb-4 mb-4">
                            <h3 className="text-xl font-bold text-slate-800">Ejecuciones de Pauta vinculadas</h3>
                            
                            {/* 🟢 RENDERIZADO CONDICIONAL DE BOTONES DE CREACIÓN */}
                            <div className="flex gap-2 items-center">
                                {!hasSrlNota && !hasSasNotaWeb && !hasSasRedes && !canCreateUnplannedExecutions && (
                                    <span className="text-xs text-slate-400 italic font-medium">
                                        (No hay productos de ejecución facturados en la OP)
                                    </span>
                                )}
                                
                                {(hasSrlNota || canCreateUnplannedExecutions) && (
                                    <Button 
                                        size="sm" 
                                        className="bg-blue-600 hover:bg-blue-700" 
                                        disabled={!isOrderApproved}
                                        onClick={() => router.push(`/notas/new?orderId=${order.id}`)}
                                    >
                                        <Film className="w-4 h-4 mr-2" /> + Nota Comercial
                                    </Button>
                                )}
                                {(hasSasNotaWeb || canCreateUnplannedExecutions) && (
                                    <Button 
                                        size="sm" 
                                        className="bg-orange-500 hover:bg-orange-600 text-white" 
                                        disabled={!isOrderApproved}
                                        onClick={() => router.push(`/notas-web/new?orderId=${order.id}`)}
                                    >
                                        <Globe className="w-4 h-4 mr-2" /> + Nota Web
                                    </Button>
                                )}
                                {(hasSasRedes || canCreateUnplannedExecutions) && (
                                    <Button 
                                        size="sm" 
                                        className="bg-pink-600 hover:bg-pink-700" 
                                        disabled={!isOrderApproved}
                                        onClick={() => router.push(`/redes/new?orderId=${order.id}`)}
                                    >
                                        <Share2 className="w-4 h-4 mr-2" /> + Pedido Redes
                                    </Button>
                                )}
                            </div>
                        </div>

                        {canCreateUnplannedExecutions && isOrderApproved && !hasSrlNota && !hasSasNotaWeb && !hasSasRedes && (
                            <div className="bg-blue-50 text-blue-800 p-3 rounded text-sm mb-4 border border-blue-200">
                                Como jefe/gerente podés cargar ejecuciones aunque la acción comercial no figure en los contenidos de esta orden.
                            </div>
                        )}

                        {!isOrderApproved && (hasSrlNota || hasSasNotaWeb || hasSasRedes || canCreateUnplannedExecutions) && (
                            <div className="bg-amber-50 text-amber-800 p-3 rounded text-sm mb-4 border border-amber-200">
                                ⚠️ Para poder cargar Ejecuciones, la Orden de Publicidad Madre debe estar en estado <strong>Aprobado</strong>. (Estado actual: {order.status || 'Pendiente'})
                            </div>
                        )}

                        <div className="space-y-4">
                            {linkedNotes.length === 0 && linkedSocial.length === 0 && linkedWebNotes.length === 0 && (
                                <div className="text-center text-slate-500 py-6 text-sm">
                                    No hay ejecuciones cargadas para esta orden todavía.
                                </div>
                            )}

                            {linkedNotes.map(n => (
                                <div key={n.id} className="flex justify-between items-center bg-blue-50/50 border border-blue-100 p-3 rounded-md">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-blue-900 text-sm flex items-center gap-1.5"><Film className="w-4 h-4"/> {n.title}</span>
                                        <span className="text-xs text-slate-600">Cargada el {format(new Date(n.createdAt), 'dd/MM/yyyy')}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className={n.status === 'Aprobado' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                                            {n.status || 'Borrador'}
                                        </Badge>
                                        <Button variant="ghost" size="sm" onClick={() => router.push(`/notas/new?editId=${n.id}`)}><Eye className="w-4 h-4 mr-1"/> Ver</Button>
                                    </div>
                                </div>
                            ))}

                            {linkedWebNotes.map(w => (
                                <div key={w.id} className="flex justify-between items-center bg-orange-50/50 border border-orange-100 p-3 rounded-md">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-orange-900 text-sm flex items-center gap-1.5"><Globe className="w-4 h-4"/> {w.format}</span>
                                        <span className="text-xs text-slate-600">Cargada el {format(new Date(w.createdAt), 'dd/MM/yyyy')}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className={w.status === 'Aprobado' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                                            {w.status || 'Borrador'}
                                        </Badge>
                                        <Button variant="ghost" size="sm" onClick={() => router.push(`/notas-web/new?editId=${w.id}`)}><Eye className="w-4 h-4 mr-1"/> Ver</Button>
                                    </div>
                                </div>
                            ))}

                            {linkedSocial.map(s => (
                                <div key={s.id} className="flex justify-between items-center bg-pink-50/50 border border-pink-100 p-3 rounded-md">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-pink-900 text-sm flex items-center gap-1.5"><Share2 className="w-4 h-4"/> {s.contentType} - {s.objective}</span>
                                        <span className="text-xs text-slate-600">Sugerido para el {s.publishDate ? format(new Date(s.publishDate), 'dd/MM/yyyy') : 'Sin fecha'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="outline" className={s.status === 'Aprobado' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}>
                                            {s.status || 'Borrador'}
                                        </Badge>
                                        <Button variant="ghost" size="sm" onClick={() => router.push(`/redes/new?editId=${s.id}`)}><Eye className="w-4 h-4 mr-1"/> Ver</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </main>

            <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
                <AdvertisingOrderPdf ref={hiddenPdfRef} order={order} programs={programs} hidePrices={true} hideSrl={true} />
            </div>
        </div>
    );
}
