'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Eye, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { ApprovalStatus, Program, Client } from '@/lib/types';
import { getPrograms, getUserById, getClient } from '@/lib/firebase-service';
import { sendEmail } from '@/lib/google-gmail-service';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// 🟢 IMPORTAMOS LOS VISORES ORIGINALES DEL PDF
import { AdvertisingOrderPdf } from '@/components/publicidad/advertising-pdf';
import { NotePdf } from '@/components/notas/note-pdf';
import { SocialMediaPdf } from '@/components/redes/social-media-pdf';

type ApprovalItemType = 'Nota Comercial' | 'Pedido de Redes' | 'Orden de Publicidad';

interface UnifiedApprovalItem {
  id: string;
  type: ApprovalItemType;
  clientId: string;
  clientName: string;
  advisorName: string;
  title: string;
  createdAt: Date;
  status: ApprovalStatus;
  adminComments?: string;
  collectionName: string;
  rawData: any;
}

export default function ApprovalsPage() {
  const { userInfo, loading: authLoading, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [items, setItems] = useState<UnifiedApprovalItem[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedItem, setSelectedItem] = useState<UnifiedApprovalItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adminComments, setAdminComments] = useState('');
  const [actionType, setActionType] = useState<'Aprobado' | 'Devuelto' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pending';

  const documentContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !isBoss && userInfo?.role !== 'Administracion' && userInfo?.area !== 'Pautado') {
      router.push('/');
    }
  }, [userInfo, authLoading, router, isBoss]);

  const parseDate = (val: any): Date => {
    if (!val) return new Date();
    if (typeof val === 'string') return new Date(val);
    if (val.toDate) return val.toDate();
    return new Date();
  };

  const fetchData = async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const statusesToFetch: ApprovalStatus[] = ['Pendiente', 'Aprobado', 'Devuelto'];
      
      const [notesSnap, socialSnap, ordersSnap, programsData] = await Promise.all([
        getDocs(query(collection(db, 'commercial_notes'), where('status', 'in', statusesToFetch))),
        getDocs(query(collection(db, 'social_media_requests'), where('status', 'in', statusesToFetch))),
        getDocs(query(collection(db, 'advertising_orders'), where('status', 'in', statusesToFetch))),
        getPrograms()
      ]);

      setPrograms(programsData);
      const unifiedList: UnifiedApprovalItem[] = [];

      notesSnap.forEach(d => {
        const data = d.data();
        unifiedList.push({
          id: d.id,
          type: 'Nota Comercial',
          clientId: data.clientId,
          clientName: data.clientName,
          advisorName: data.advisorName,
          title: data.title || 'Nota Sin Título',
          createdAt: parseDate(data.createdAt),
          status: data.status,
          adminComments: data.adminComments,
          collectionName: 'commercial_notes',
          rawData: data
        });
      });

      socialSnap.forEach(d => {
        const data = d.data();
        unifiedList.push({
          id: d.id,
          type: 'Pedido de Redes',
          clientId: data.clientId,
          clientName: data.clientName,
          advisorName: data.advisorName,
          title: `${data.contentType} - ${data.objective || 'Sin objetivo'}`,
          createdAt: parseDate(data.createdAt),
          status: data.status,
          adminComments: data.adminComments,
          collectionName: 'social_media_requests',
          rawData: data
        });
      });

      ordersSnap.forEach(d => {
        const data = d.data();
        unifiedList.push({
          id: d.id,
          type: 'Orden de Publicidad',
          clientId: data.clientId,
          clientName: data.clientName || 'Cliente',
          advisorName: data.accountExecutive,
          title: data.product || 'Publicidad Sin Título',
          createdAt: parseDate(data.createdAt),
          status: d.metadata ? d.data().status : (data.status || 'Pendiente'),
          adminComments: data.adminComments,
          collectionName: 'advertising_orders',
          rawData: data
        });
      });

      unifiedList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setItems(unifiedList);
    } catch (error) {
      console.error("Error fetching approvals:", error);
      toast({ title: 'Error al cargar las solicitudes', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userInfo && (isBoss || userInfo.role === 'Administracion' || userInfo.area === 'Pautado')) {
      fetchData();
    }
  }, [userInfo, isBoss]);

  const openEvaluationModal = (item: UnifiedApprovalItem) => {
    setSelectedItem(item);
    setAdminComments(item.adminComments || '');
    setActionType(null);
    setIsModalOpen(true);
  };

  const generateClientSummaryPdfBase64 = (client: Client): string => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.setFont('helvetica', 'normal');
    
    pdf.setFillColor(240, 244, 248);
    pdf.rect(0, 0, 210, 40, 'F');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.setTextColor(29, 78, 216);
    pdf.text('ALTA DE DATOS COMERCIALES', 15, 25);
    
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Fecha de Reporte: ${format(new Date(), 'dd/MM/yyyy')}`, 140, 25);
    
    pdf.setDrawColor(226, 232, 240);
    pdf.line(15, 45, 195, 45);
    
    let y = 60;
    const addField = (label: string, value: string) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(51, 65, 85);
      pdf.text(`${label}:`, 15, y);
      
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(15, 23, 42);
      pdf.text(value || '-', 65, y);
      y += 12;
    };

    addField('Denominación', client.denominacion);
    addField('Razón Social', client.razonSocial);
    addField('CUIT', client.cuit || '-');
    addField('Condición de IVA', client.condicionIVA);
    addField('Rubro Comercial', client.rubro);
    addField('Localidad / Provincia', `${client.localidad} / ${client.provincia}`);
    addField('Email de Contacto', client.email);
    addField('Teléfono', client.phone);
    addField('ID Unificador Tango', client.idTango || 'No asignado');
    addField('Ejecutivo Creador', client.ownerName);

    return pdf.output('datauristring').split(',')[1];
  };

  const submitEvaluation = async () => {
    if (!selectedItem || !actionType || !userInfo) return;
    
    if (actionType === 'Devuelto' && !adminComments.trim()) {
      toast({ title: "Falta justificación", description: "Debes escribir el motivo de la devolución.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const accessToken = await getGoogleAccessToken();
      if (!accessToken) throw new Error("No se pudo obtener la autorización de Google Gmail.");

      const sellerId = selectedItem.rawData.advisorId || selectedItem.rawData.createdBy || selectedItem.rawData.creatorId;
      let sellerEmail = userInfo.email; 
      if (sellerId) {
        const sellerProfile = await getUserById(sellerId);
        if (sellerProfile?.email) {
          sellerEmail = sellerProfile.email;
        }
      }

      const docRef = doc(db, selectedItem.collectionName, selectedItem.id);
      await updateDoc(docRef, {
        status: actionType,
        adminComments: adminComments.trim(),
        approvedAt: serverTimestamp(),
        approvedBy: userInfo.id,
        approvedByName: userInfo.name
      });

      if (actionType === 'Devuelto') {
        const returnEmailBody = `
          <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
            <h2 style="color: #dc2626; margin-top: 0;">Pedido Devuelto con Correcciones</h2>
            <p>Hola <strong>${selectedItem.advisorName}</strong>,</p>
            <p>Tu solicitud de <strong>${selectedItem.type}</strong> para el cliente <strong>${selectedItem.clientName}</strong> ha sido revisada y requiere modificaciones antes de ser procesada.</p>
            <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; font-style: italic; color: #991b1b;">
              <strong>Motivo de la devolución especificado por Administración:</strong><br/>
              "${adminComments.trim()}"
            </div>
            <p>Por favor, ingresa al CRM, edita los datos indicados en el pedido correspondiente y vuelve a enviarlo para evaluación.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 11px; color: #64748b; margin: 0;">Este es un aviso automático del Centro de Revisión del CRM.</p>
          </div>
        `;

        await sendEmail({
          accessToken,
          to: [sellerEmail, 'lchena@airedesantafe.com.ar'],
          subject: `Corrección Requerida - ${selectedItem.type}: ${selectedItem.clientName}`,
          body: returnEmailBody
        });

        toast({ title: 'Pedido devuelto y asesor notificado por email.' });

      } else if (actionType === 'Aprobado' && documentContainerRef.current) {
        const elementToCapture = documentContainerRef.current.firstChild as HTMLElement;
        const canvas = await html2canvas(elementToCapture, { scale: 1.5, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        
        const docPdf = new jsPDF('l', 'mm', 'a4', true);
        const pdfWidth = 297;
        const pdfHeight = 210;
        const ratio = canvas.width / canvas.height;
        const mappedHeight = pdfWidth / ratio;
        
        let heightLeft = mappedHeight;
        let position = 0;
        docPdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, mappedHeight);
        heightLeft -= pdfHeight;
        
        while (heightLeft > 0) {
          position -= pdfHeight;
          docPdf.addPage();
          docPdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, mappedHeight);
          heightLeft -= pdfHeight;
        }
        const orderBase64 = docPdf.output('datauristring').split(',')[1];

        let clientBase64 = '';
        if (selectedItem.clientId) {
          const clientObj = await getClient(selectedItem.clientId);
          if (clientObj) {
            clientBase64 = generateClientSummaryPdfBase64(clientObj);
          }
        }

        const attachments = [
          {
            filename: `${selectedItem.type.replace(/ /g, '_')}_${selectedItem.clientName.replace(/ /g, '_')}.pdf`,
            content: orderBase64,
            encoding: 'base64'
          }
        ];

        if (clientBase64) {
          attachments.push({
            filename: `Alta_Cliente_${selectedItem.clientName.replace(/ /g, '_')}.pdf`,
            content: clientBase64,
            encoding: 'base64'
          });
        }

        const approvalEmailBody = `
          <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
            <h2 style="color: #16a34a; margin-top: 0;">✓ Pedido Ingresado Correctamente</h2>
            <p>Se informa que el Centro de Revisión ha validado y **APROBADO** el ingreso formal del siguiente trámite:</p>
            <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; line-height: 1.6;">
              <strong>Tipo de Documento:</strong> ${selectedItem.type}<br/>
              <strong>Anunciante / Razón Social:</strong> ${selectedItem.clientName}<br/>
              <strong>Asesor Comercial:</strong> ${selectedItem.advisorName}<br/>
              <strong>Referencia:</strong> ${selectedItem.title}<br/>
              <strong>Fecha de Aprobación:</strong> ${format(new Date(), 'dd/MM/yyyy HH:mm')}hs
            </div>
            <p>Se adjuntan a este correo los documentos definitivos en formato PDF (Planilla de Medios / Especificaciones de Carga junto con la Ficha de Alta del Anunciante) para los departamentos de pautado, administración y producción.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 11px; color: #64748b; margin: 0;">Copia archivada en el histórico de aprobaciones del CRM.</p>
          </div>
        `;

        await sendEmail({
          accessToken,
          to: ['materiales@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'lchena@airedesantafe.com.ar', sellerEmail],
          subject: `INGRESO CORRECTO - ${selectedItem.type}: ${selectedItem.clientName}`,
          body: approvalEmailBody,
          attachments
        });

        toast({ title: 'Pedido registrado e emails con adjuntos enviados.' });
      }

      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error updating status or sending notifications:", error);
      toast({ title: "Error al procesar la aprobación", description: "El pedido pudo haberse guardado pero falló el envío de emails.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const getTypeColorClass = (type: ApprovalItemType) => {
    switch(type) {
      case 'Nota Comercial': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Pedido de Redes': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'Orden de Publicidad': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // 🟢 FUNCIÓN RENDER TABLE RESTAURADA (Corrige el Client-Side Crash)
  const renderTable = (data: UnifiedApprovalItem[], showActions: boolean = true) => (
    <div className="rounded-md border bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Asesor</TableHead>
            <TableHead>Referencia</TableHead>
            {showActions && <TableHead className="text-right">Acción</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No hay documentos en esta bandeja.</TableCell></TableRow>
          ) : (
            data.map((item) => (
              <TableRow key={item.id} className="hover:bg-slate-50 transition-colors">
                <TableCell className="font-medium text-slate-700">
                  {format(item.createdAt, 'dd/MM/yyyy HH:mm')}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getTypeColorClass(item.type)}>{item.type}</Badge>
                </TableCell>
                <TableCell className="font-semibold">{item.clientName}</TableCell>
                <TableCell>{item.advisorName}</TableCell>
                <TableCell className="text-muted-foreground truncate max-w-xs">{item.title}</TableCell>
                {showActions && (
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => openEvaluationModal(item)}>
                      <Eye className="w-4 h-4 mr-2" /> Evaluar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  const pendingItems = items.filter(i => i.status === 'Pendiente');
  const approvedItems = items.filter(i => i.status === 'Aprobado');
  const returnedItems = items.filter(i => i.status === 'Devuelto');

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <Header title="Bandeja de Aprobaciones" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Centro de Revisión</h2>
          <p className="text-muted-foreground">Administra y valida las cargas comerciales hechas por los asesores antes de enviarlas a Pautado.</p>
        </div>

        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-6">
            <TabsTrigger value="pending" className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900">
              <Clock className="w-4 h-4 mr-2 hidden sm:block"/> Pendientes ({pendingItems.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-900">
              <CheckCircle2 className="w-4 h-4 mr-2 hidden sm:block"/> Aprobadas
            </TabsTrigger>
            <TabsTrigger value="returned" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-900">
              <XCircle className="w-4 h-4 mr-2 hidden sm:block"/> Devueltas
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="pending" className="mt-0">
            {renderTable(pendingItems, true)}
          </TabsContent>
          <TabsContent value="approved" className="mt-0">
            {renderTable(approvedItems, false)}
          </TabsContent>
          <TabsContent value="returned" className="mt-0">
            {renderTable(returnedItems, false)}
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL DE AUDITORÍA CON EL VISOR ORIGINAL DE PDF INCRUSTADO */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[96vw] xl:max-w-[1400px] h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-200 border-0">
          
          <DialogHeader className="px-6 py-4 bg-white z-10 shrink-0 shadow-sm flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                Auditoría: <Badge className={getTypeColorClass(selectedItem?.type as any)}>{selectedItem?.type}</Badge>
              </DialogTitle>
              <DialogDescription>
                Verifique minuciosamente la planilla oficial antes de validar o rechazar el registro.
              </DialogDescription>
            </div>
            <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cerrar</Button>
            </div>
          </DialogHeader>
          
          {/* CONTENEDOR DEL DOCUMENTO ORIGINAL CON SCROLL RE-PARAMETRIZADO */}
          <div className="flex-1 overflow-auto bg-slate-400/50 p-4 md:p-8 shadow-inner block">
            <div ref={documentContainerRef} className="w-fit mx-auto bg-white shadow-2xl border border-slate-300 relative">
                 {selectedItem?.type === 'Nota Comercial' && (
                    <NotePdf note={selectedItem.rawData} programs={programs} />
                 )}
                 {selectedItem?.type === 'Pedido de Redes' && (
                    <SocialMediaPdf request={selectedItem.rawData} />
                 )}
                 {selectedItem?.type === 'Orden de Publicidad' && (
                    <AdvertisingOrderPdf order={selectedItem.rawData} programs={programs} />
                 )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 bg-white shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
             <div className="flex flex-col w-full space-y-4">
                
                {/* Cuadro operativo */}
                <div className="flex flex-col sm:flex-row gap-4 items-start w-full bg-slate-50 p-4 border rounded-md">
                    <div className="flex-1 w-full space-y-2">
                        <Label htmlFor="comments" className="font-bold text-slate-800 text-sm">
                            Observaciones de Devolución / Aprobación
                        </Label>
                        <Textarea 
                            id="comments" 
                            placeholder="Si rechaza el pedido, escriba detalladamente los motivos aquí para guiar la corrección del vendedor..." 
                            value={adminComments}
                            onChange={(e) => setAdminComments(e.target.value)}
                            className="bg-white text-xs min-h-[60px]"
                        />
                        {actionType === 'Devuelto' && !adminComments.trim() && (
                          <span className="text-xs text-red-500 font-bold block">⚠️ Justificación obligatoria para rebotar pedidos.</span>
                        )}
                    </div>
                    
                    {/* Botonera de control */}
                    <div className="flex flex-col gap-2 w-full sm:w-64 pt-6">
                        {!actionType ? (
                            <>
                                <Button type="button" variant="destructive" className="w-full" onClick={() => setActionType('Devuelto')}>
                                    Devolver al Asesor
                                </Button>
                                <Button type="button" className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => setActionType('Aprobado')}>
                                    Aprobar Documento
                                </Button>
                            </>
                        ) : (
                            <div className="flex flex-col gap-2 p-3 border rounded-md shadow-sm bg-white">
                                <span className="text-xs font-bold text-center block mb-1">
                                    ¿Confirmar {actionType}?
                                </span>
                                <Button 
                                    type="button" 
                                    onClick={submitEvaluation} 
                                    disabled={isSaving || (actionType === 'Devuelto' && !adminComments.trim())} 
                                    className={actionType === 'Aprobado' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                                >
                                    {isSaving ? <Spinner size="small" className="mr-2" /> : `SÍ, CONFIRMAR`}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setActionType(null)} disabled={isSaving}>
                                    Cancelar
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

             </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
