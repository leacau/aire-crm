'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, updateDoc, doc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Eye, CheckCircle2, XCircle, Clock, Edit3, ArrowRight, History } from 'lucide-react';
import type { ApprovalStatus, Program, Client, ApprovalHistoryItem } from '@/lib/types';
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
  approvalHistory?: ApprovalHistoryItem[];
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

  // 🟢 PERMISOS AMPLIADOS: Cualquier usuario autenticado puede entrar a ver el componente
  useEffect(() => {
    if (!authLoading && !userInfo) {
      router.push('/login');
    }
  }, [userInfo, authLoading, router]);

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
      // 🟢 LOS ASESORES VEN TAMBIÉN SUS BORRADORES EN ESTA PANTALLA
      const statusesToFetch: ApprovalStatus[] = ['Pendiente', 'Aprobado', 'Devuelto', 'Borrador'];
      const isReviewer = isBoss || userInfo.role === 'Administracion' || userInfo.area === 'Pautado' || userInfo.role === 'Gerencia' || userInfo.role === 'Jefe';
      
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
        const isOwner = data.advisorId === userInfo.id;
        // 🟢 REGRA FILTRADO: Si es asesor y no es dueño de la nota, se descarta
        if (!isReviewer && !isOwner) return;

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
          rawData: data,
          approvalHistory: data.approvalHistory || []
        });
      });

      socialSnap.forEach(d => {
        const data = d.data();
        const isOwner = data.advisorId === userInfo.id;
        if (!isReviewer && !isOwner) return;

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
          rawData: data,
          approvalHistory: data.approvalHistory || []
        });
      });

      ordersSnap.forEach(d => {
        const data = d.data();
        const isOwner = data.createdBy === userInfo.id || data.advisorId === userInfo.id;
        if (!isReviewer && !isOwner) return;

        unifiedList.push({
          id: d.id,
          type: 'Orden de Publicidad',
          clientId: data.clientId,
          clientName: data.clientName || 'Cliente',
          advisorName: data.accountExecutive,
          title: data.product || 'Publicidad Sin Título',
          createdAt: parseDate(data.createdAt),
          status: data.status || 'Pendiente',
          adminComments: data.adminComments,
          collectionName: 'advertising_orders',
          rawData: data,
          approvalHistory: data.approvalHistory || []
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
    if (userInfo) {
      fetchData();
    }
  }, [userInfo]);

  const openEvaluationModal = (item: UnifiedApprovalItem) => {
    setSelectedItem(item);
    setAdminComments(item.adminComments || '');
    setActionType(null);
    setIsModalOpen(true);
  };

  // Redirección directa a la pantalla de edición correspondiente
  const handleEditRedirect = (item: UnifiedApprovalItem) => {
    setIsModalOpen(false);
    if (item.type === 'Nota Comercial') {
      router.push(`/notas/new?editId=${item.id}`);
    } else if (item.type === 'Pedido de Redes') {
      router.push(`/redes/new?editId=${item.id}`);
    } else if (item.type === 'Orden de Publicidad') {
      router.push(`/publicidad/new?editId=${item.id}`);
    }
  };

  const generateClientSummaryPdfBase64 = (client: Client): string => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.setFont('helvetica', 'normal');
    pdf.setFillColor(240, 244, 248);
    pdf.rect(0, 0, 210, 40, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(29, 78, 216);
    pdf.text('ALTA DE DATOS COMERCIALES', 15, 25);
    
    let y = 60;
    const addField = (label: string, value: string) => {
      pdf.setFont('helvetica', 'bold'); pdf.text(`${label}:`, 15, y);
      pdf.setFont('helvetica', 'normal'); pdf.text(value || '-', 65, y);
      y += 12;
    };
    addField('Anunciante', client.denominacion);
    addField('Razón Social', client.razonSocial);
    addField('CUIT', client.cuit || '-');
    addField('Condición de IVA', client.condicionIVA);
    addField('ID Tango', client.idTango || 'No asignado');
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
      if (!accessToken) throw new Error("No se pudo obtener la autorización de Gmail.");

      const sellerId = selectedItem.rawData.advisorId || selectedItem.rawData.createdBy || selectedItem.rawData.creatorId;
      let sellerEmail = userInfo.email; 
      if (sellerId) {
        const sellerProfile = await getUserById(sellerId);
        if (sellerProfile?.email) sellerEmail = sellerProfile.email;
      }

      // 🟢 LOG CRONOLÓGICO: Creamos la nueva entrada para el array del historial
      const historyItem: ApprovalHistoryItem = {
        timestamp: format(new Date(), 'dd/MM/yyyy HH:mm'),
        status: actionType,
        userId: userInfo.id,
        userName: userInfo.name,
        userRole: userInfo.role,
        comments: adminComments.trim() || undefined
      };

      const docRef = doc(db, selectedItem.collectionName, selectedItem.id);
      await updateDoc(docRef, {
        status: actionType,
        adminComments: adminComments.trim(),
        approvedAt: serverTimestamp(),
        approvedBy: userInfo.id,
        approvedByName: userInfo.name,
        // 🟢 INYECCIÓN SIN SOBREESCRITURA CON ARRAYUNION
        approvalHistory: arrayUnion(historyItem)
      });

      const baseUrl = window.location.origin;

      if (actionType === 'Devuelto') {
        // 🟢 MAIL DE DEVOLUCIÓN RE-CALIBRADO CON LINK DIRECTO
        const returnEmailBody = `
          <div style="font-family: Arial, sans-serif; color: #333; max-w: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #dc2626;">Corrección Requerida en tu Pedido</h2>
            <p>Hola <strong>${selectedItem.advisorName}</strong>,</p>
            <p>Tu solicitud de <strong>${selectedItem.type}</strong> para el cliente <strong>${selectedItem.clientName}</strong> requiere correcciones.</p>
            <p><strong>Observaciones de Administración:</strong> "${adminComments.trim()}"</p>
            <p>Para ingresar rápidamente a revisar las solicitudes devueltas y corregir los datos, haz clic en el siguiente enlace:</p>
            <p><a href="${baseUrl}/approvals?tab=returned" style="display: inline-block; padding: 10px 20px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">IR A CORREGIR PEDIDO</a></p>
          </div>
        `;

        await sendEmail({
          accessToken,
          to: [sellerEmail, 'lchena@airedesantafe.com.ar'],
          subject: `Corrección Requerida - ${selectedItem.type}: ${selectedItem.clientName}`,
          body: returnEmailBody
        });

      } else if (actionType === 'Aprobado' && documentContainerRef.current) {
        const elementToCapture = documentContainerRef.current.firstChild as HTMLElement;
        const canvas = await html2canvas(elementToCapture, { scale: 1.5, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        
        const docPdf = new jsPDF('l', 'mm', 'a4', true);
        const pdfWidth = 297; const pdfHeight = 210;
        const ratio = canvas.width / canvas.height;
        const mappedHeight = pdfWidth / ratio;
        
        let heightLeft = mappedHeight; let position = 0;
        docPdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, mappedHeight);
        heightLeft -= pdfHeight;
        while (heightLeft > 0) {
          position -= pdfHeight; docPdf.addPage(); docPdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, mappedHeight);
          heightLeft -= pdfHeight;
        }
        const orderBase64 = docPdf.output('datauristring').split(',')[1];

        let clientBase64 = '';
        if (selectedItem.clientId) {
          const clientObj = await getClient(selectedItem.clientId);
          if (clientObj) clientBase64 = generateClientSummaryPdfBase64(clientObj);
        }

        const attachments = [
          { filename: `${selectedItem.type.replace(/ /g, '_')}_${selectedItem.clientName.replace(/ /g, '_')}.pdf', content: orderBase64, encoding: 'base64' }
        ];
        if (clientBase64) {
          attachments.push({ filename: `Alta_Cliente_${selectedItem.clientName.replace(/ /g, '_')}.pdf`, content: clientBase64, encoding: 'base64' });
        }

        const approvalEmailBody = `
          <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #16a34a;">✓ Pedido Ingresado Correctamente</h2>
            <p>Se informa que el Centro de Revisión ha aprobado de manera definitiva la carga de <strong>${selectedItem.type}</strong> para el cliente <strong>${selectedItem.clientName}</strong>.</p>
            <p>Se adjuntan los PDFs finales de carga y alta comercial correspondientes.</p>
          </div>
        `;

        await sendEmail({
          accessToken,
          to: ['materiales@airedesantafe.com.ar', 'alucca@airedesantafe.com.ar', 'lchena@airedesantafe.com.ar', sellerEmail],
          subject: `INGRESO CORRECTO - ${selectedItem.type}: ${selectedItem.clientName}`,
          body: approvalEmailBody,
          attachments
        });
      }

      toast({ title: `Documento marcando como ${actionType} exitosamente.` });
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error(error);
      toast({ title: "Error al procesar la revisión", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const pendingItems = items.filter(i => i.status === 'Pendiente');
  const approvedItems = items.filter(i => i.status === 'Aprobado');
  const returnedItems = items.filter(i => i.status === 'Devuelto' || i.status === 'Borrador');

  const isReviewer = userInfo && (isBoss || userInfo.role === 'Administracion' || userInfo.area === 'Pautado');

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <Header title="Bandeja de Aprobaciones" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Centro de Revisión</h2>
          <p className="text-muted-foreground">
            {isReviewer 
              ? 'Administra, audita y valida las cargas de los asesores antes de enviarlas a pautado final.' 
              : 'Monitorea el estado de aprobación de tus notas, redes y órdenes enviadas a la administración.'}
          </p>
        </div>

        <Tabs defaultValue={initialTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-6">
            <TabsTrigger value="pending" className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900">
              <Clock className="w-4 h-4 mr-2 hidden sm:block"/> {isReviewer ? 'Por Resolver' : 'En Espera'} ({pendingItems.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-900">
              <CheckCircle2 className="w-4 h-4 mr-2 hidden sm:block"/> Aprobadas
            </TabsTrigger>
            <TabsTrigger value="returned" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-900">
              <XCircle className="w-4 h-4 mr-2 hidden sm:block"/> {isReviewer ? 'Rechazadas' : 'Para Corregir'}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="pending" className="mt-0">{renderTable(pendingItems, true)}</TabsContent>
          <TabsContent value="approved" className="mt-0">{renderTable(approvedItems, true)}</TabsContent>
          <TabsContent value="returned" className="mt-0">{renderTable(returnedItems, true)}</TabsContent>
        </Tabs>
      </main>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[96vw] xl:max-w-[1400px] h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-200 border-0">
          
          <DialogHeader className="px-6 py-4 bg-white z-10 shrink-0 shadow-sm flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl">
                Auditoría: <Badge className={getTypeColorClass(selectedItem?.type as any)}>{selectedItem?.type}</Badge>
                {selectedItem?.status && <Badge variant="outline" className="text-xs uppercase">{selectedItem.status}</Badge>}
              </DialogTitle>
            </div>
            <div className="flex gap-2">
                {/* 🟢 NUEVO: BOTÓN DIRECTO DE CORRECCIÓN PARA EL ASESOR */}
                {selectedItem && (selectedItem.status === 'Devuelto' || selectedItem.status === 'Borrador') && (
                  <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700 font-bold" onClick={() => handleEditRedirect(selectedItem)}>
                    <Edit3 className="w-4 h-4 mr-2" /> Corregir y Editar Pedido
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cerrar</Button>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto bg-slate-400/50 p-4 md:p-8 shadow-inner block">
            <div ref={documentContainerRef} className="w-fit mx-auto bg-white shadow-2xl border border-slate-300 relative">
                 {selectedItem?.type === 'Nota Comercial' && <NotePdf note={selectedItem.rawData} programs={programs} />}
                 {selectedItem?.type === 'Pedido de Redes' && <SocialMediaPdf request={selectedItem.rawData} />}
                 {selectedItem?.type === 'Orden de Publicidad' && <AdvertisingOrderPdf order={selectedItem.rawData} programs={programs} />}
            </div>
            
            {/* 🟢 NUEVA INTERFAZ VISUAL: RENDER DEL TIMELINE DE HISTORIAL */}
            {selectedItem?.approvalHistory && selectedItem.approvalHistory.length > 0 && (
              <div className="max-w-5xl mx-auto bg-white mt-6 rounded-lg p-5 border border-slate-300 shadow-xl">
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 mb-4 uppercase tracking-wider">
                  <History className="w-4 h-4 text-slate-600"/> Historial de Ida y Vuelta (Auditoría de Pedido)
                </h3>
                <div className="space-y-4 relative border-l-2 border-slate-200 pl-4 ml-2">
                  {selectedItem.approvalHistory.map((history, i) => (
                    <div key={i} className="relative group text-xs">
                      <div className="absolute -left-[21px] top-1 bg-white border-2 border-slate-400 rounded-full w-2.5 h-2.5 group-last:border-green-600" />
                      <div className="flex flex-wrap items-center gap-2 text-slate-500 font-mono">
                        <span className="font-bold text-slate-700">{history.timestamp}</span>
                        <span>•</span>
                        <span className="font-sans font-semibold text-slate-800">{history.userName}</span>
                        <span className="text-[10px] bg-slate-100 px-1 rounded font-sans">{history.userRole}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <Badge variant="outline" className="text-[9px] py-0">{history.status}</Badge>
                      </div>
                      {history.comments && (
                        <div className="mt-1 bg-slate-50 border p-2 rounded text-slate-700 italic max-w-2xl">
                          "{history.comments}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ACCIONES OPERATIVAS: Sólo disponibles para el Revisor/Administrador */}
          <DialogFooter className="px-6 py-4 bg-white shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10">
             <div className="flex flex-col w-full space-y-4">
                {isReviewer ? (
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
                                  <span className="text-xs font-bold text-center block mb-1">¿Confirmar {actionType}?</span>
                                  <Button 
                                      type="button" 
                                      onClick={submitEvaluation} 
                                      disabled={isSaving || (actionType === 'Devuelto' && !adminComments.trim())} 
                                      className={actionType === 'Aprobado' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                                >
                                      {isSaving ? <Spinner size="small" className="mr-2" /> : `SÍ, CONFIRMAR`}
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setActionType(null)} disabled={isSaving}>Cancelar</Button>
                              </div>
                          )}
                      </div>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 text-blue-800 text-center rounded border border-blue-100 text-xs font-medium">
                    Vista de lectura para Asesores Comerciales. Si requieres corregir este pedido, utiliza el botón "Corregir y Editar" en la parte superior derecha.
                  </div>
                )}
             </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
