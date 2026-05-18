'use client';

import React, { useState, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Eye, CheckCircle2, XCircle, Clock, Calendar, dollarSign, FileText, Share2, Film, List } from 'lucide-react';
import type { ApprovalStatus } from '@/lib/types';

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
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [items, setItems] = useState<UnifiedApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el Modal de Evaluación Avanzada
  const [selectedItem, setSelectedItem] = useState<UnifiedApprovalItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [adminComments, setAdminComments] = useState('');
  const [actionType, setActionType] = useState<'Aprobado' | 'Devuelto' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pending';

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

  const formatSafeDate = (dateStr: string, formatPattern: string = 'dd/MM/yyyy') => {
    if (!dateStr) return '-';
    try {
      const parsed = parseISO(dateStr);
      return isValid(parsed) ? format(parsed, formatPattern, { locale: es }) : dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const fetchData = async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const statusesToFetch: ApprovalStatus[] = ['Pendiente', 'Aprobado', 'Devuelto'];
      
      const [notesSnap, socialSnap, ordersSnap] = await Promise.all([
        getDocs(query(collection(db, 'commercial_notes'), where('status', 'in', statusesToFetch))),
        getDocs(query(collection(db, 'social_media_requests'), where('status', 'in', statusesToFetch))),
        getDocs(query(collection(db, 'advertising_orders'), where('status', 'in', statusesToFetch)))
      ]);

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

  const submitEvaluation = async () => {
    if (!selectedItem || !actionType || !userInfo) return;
    
    if (actionType === 'Devuelto' && !adminComments.trim()) {
      toast({ title: "Falta justificación", description: "Debes escribir el motivo de la devolución para orientar al asesor.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const docRef = doc(db, selectedItem.collectionName, selectedItem.id);
      await updateDoc(docRef, {
        status: actionType,
        adminComments: adminComments.trim(),
        approvedAt: serverTimestamp(),
        approvedBy: userInfo.id,
        approvedByName: userInfo.name
      });

      toast({ title: `Documento ${actionType} correctamente.` });
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({ title: "Error al actualizar", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const getTypeColor = (type: ApprovalItemType) => {
    switch(type) {
      case 'Nota Comercial': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Pedido de Redes': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'Orden de Publicidad': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // 🟢 COMPONENTE INTERNO: DETALLES DE NOTA COMERCIAL
  const RenderNotaComercialDetails = ({ raw }: { raw: any }) => (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-4 bg-slate-50 p-3 rounded border">
        <div><span className="text-muted-foreground text-xs block">VALOR TOTAL TARIFARIO</span><span className="font-bold">${Number(raw.totalValue || 0).toLocaleString('es-AR')}</span></div>
        <div><span className="text-muted-foreground text-xs block">VALOR VENTA REAL</span><span className="font-bold text-blue-600">${Number(raw.saleValue || 0).toLocaleString('es-AR')}</span></div>
        <div><span className="text-muted-foreground text-xs block">DESAJUSTE / BONIF.</span><span className={`font-bold ${raw.mismatch > 0 ? 'text-red-500' : 'text-slate-700'}`}>${Number(raw.mismatch || 0).toLocaleString('es-AR')}</span></div>
      </div>

      {raw.financialObservations && (
        <div className="bg-amber-50 p-2 border border-amber-200 rounded text-xs text-amber-900">
          <strong>Obs. Financieras:</strong> {raw.financialObservations}
        </div>
      )}

      <div>
        <h4 className="font-bold text-slate-800 flex items-center gap-1 mb-2"><Film className="w-4 h-4 text-blue-500"/> Zócalos / Grafs de Pantalla</h4>
        <div className="space-y-2">
          <div className="p-2 bg-slate-900 text-slate-100 font-mono rounded text-xs">
            <span className="text-yellow-400 block text-[10px]">TITULAR PRINCIPAL (Max 84 chr):</span>
            {raw.primaryGrafs?.join(' / ') || raw.primaryGraf || '-'}
          </div>
          <div className="p-2 bg-slate-900 text-slate-100 font-mono rounded text-xs">
            <span className="text-yellow-400 block text-[10px]">NOMBRE / FUNCIÓN (Max 55 chr):</span>
            {raw.secondaryGrafs?.join(' / ') || raw.secondaryGraf || '-'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="border rounded p-3 bg-white">
          <span className="font-bold text-slate-800 block mb-1">Entrevistados</span>
          <ul className="list-disc pl-4 space-y-1 text-xs">
            {raw.interviewees?.map((i: any, idx: number) => (
              <li key={idx}><strong>{i.name}</strong> ({i.role}) - <Badge variant="secondary" className="text-[10px] py-0">{i.location}</Badge></li>
            )) || <li>{raw.intervieweeName} ({raw.intervieweeRole})</li>}
          </ul>
        </div>
        <div className="border rounded p-3 bg-white">
          <span className="font-bold text-slate-800 block mb-1">Cronograma de Salidas</span>
          <div className="max-h-24 overflow-y-auto text-xs space-y-1">
            {Object.entries(raw.schedule || {}).map(([progId, dates]: any) => (
              <div key={progId} className="border-b pb-1 last:border-0">
                <span className="font-semibold block text-slate-600">Programa ID: {progId}</span>
                {dates.map((d: any, i: number) => <span key={i} className="inline-block bg-slate-100 px-1.5 py-0.5 rounded mr-1 mb-1">{formatSafeDate(d.date)} {d.time}hs</span>)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs border-t pt-2">
        <div><strong>Contacto Coordinación:</strong> {raw.contactName || '-'} ({raw.contactPhone || '-'})</div>
        <div><strong>Réplica Web:</strong> {raw.replicateWeb ? 'SÍ' : 'NO'} | <strong>Redes:</strong> {raw.replicateSocials?.join(', ') || 'Ninguna'}</div>
      </div>
    </div>
  );

  // 🟢 COMPONENTE INTERNO: DETALLES DE PEDIDO DE REDES
  const RenderPedidoRedesDetails = ({ raw }: { raw: any }) => (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="p-2 border rounded bg-slate-50"><strong>FORMATO:</strong> {raw.contentType}</div>
        <div className="p-2 border rounded bg-slate-50"><strong>EQUIPO CREADOR:</strong> {raw.creator}</div>
        <div className="p-2 border rounded bg-slate-50"><strong>PUBLICA SUGERIDA:</strong> {formatSafeDate(raw.publishDate)}</div>
      </div>

      {raw.contentType === 'Reel' && (
        <div className="grid grid-cols-3 gap-2 bg-amber-50/50 p-2 border border-dashed rounded text-xs">
          <div><strong>Lugar Grabación:</strong> {raw.recordingLocation || '-'}</div>
          <div><strong>Fecha Grabación:</strong> {formatSafeDate(raw.recordingDate)}</div>
          <div><strong>Hora:</strong> {raw.recordingTime || '-'}</div>
        </div>
      )}

      <div>
        <Label className="font-bold text-slate-700 block mb-1">Objetivo Estratégico de la Publicación</Label>
        <div className="p-2.5 bg-slate-50 rounded border text-xs text-slate-700 whitespace-pre-wrap">{raw.objective}</div>
      </div>

      <div>
        <Label className="font-bold text-slate-700 block mb-1">Idea de Guion / Instrucciones</Label>
        <div className="p-2.5 bg-slate-50 rounded border text-xs text-slate-700 whitespace-pre-wrap">{raw.script || 'Sin detalles'}</div>
      </div>

      {(raw.contentType === 'Reel' || raw.contentType === 'Carrusel') && raw.reelCopy && (
        <div>
          <Label className="font-bold text-pink-700 block mb-1">Texto del Copy (Feed)</Label>
          <div className="p-2.5 bg-pink-50/30 border border-pink-100 rounded text-xs text-slate-800 whitespace-pre-wrap font-mono">{raw.reelCopy}</div>
        </div>
      )}

      {raw.contentType === 'Story' && (
        <div className="p-3 bg-orange-50/30 border border-orange-100 rounded text-xs space-y-1">
          <span className="font-bold text-orange-800 block mb-1">Datos de la Historia</span>
          <p><strong>Replicar Nota Web:</strong> {raw.isWebReplication ? 'SÍ' : 'NO'}</p>
          {raw.storyUrl && <p><strong>Enlace del Sticker:</strong> <span className="text-blue-600 break-all">{raw.storyUrl}</span> ({raw.storyCta || 'Sin CTA'})</p>}
          {raw.storyTagClient && <p><strong>Arroba Cuenta:</strong> {raw.storyTagHandle || '-'}</p>}
        </div>
      )}

      {raw.materialUrl && (
        <div className="text-xs bg-slate-100 p-2 rounded truncate">
          <strong>Material de Apoyo:</strong> <span className="text-blue-600 font-mono">{raw.materialUrl}</span>
        </div>
      )}
    </div>
  );

  // 🟢 COMPONENTE INTERNO: DETALLES DE ORDEN DE PUBLICIDAD
  const RenderOrdenPublicidadDetails = ({ raw }: { raw: any }) => (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-4 gap-2 bg-slate-50 p-3 rounded border text-center">
        <div><span className="text-muted-foreground text-[10px] block uppercase">Vigencia Desde</span><span className="font-semibold">{formatSafeDate(raw.startDate)}</span></div>
        <div><span className="text-muted-foreground text-[10px] block uppercase">Vigencia Hasta</span><span className="font-semibold">{formatSafeDate(raw.endDate)}</span></div>
        <div><span className="text-muted-foreground text-[10px] block uppercase">Orden Tango</span><span className="font-mono font-bold text-blue-600">{raw.tangoOrderNo || 'PENDIENTE'}</span></div>
        <div><span className="text-muted-foreground text-[10px] block uppercase">Certificados</span><span className="font-semibold">{raw.certReq ? 'SÍ' : 'NO'}</span></div>
      </div>

      {raw.srlItems && raw.srlItems.length > 0 && (
        <div>
          <span className="font-bold text-slate-800 block mb-1 text-xs uppercase text-primary">Detalle de Pauta AIRE SRL</span>
          <div className="border rounded overflow-hidden text-xs">
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="py-1">Mes</TableHead>
                  <TableHead className="py-1">Programa ID</TableHead>
                  <TableHead className="py-1">Tipo</TableHead>
                  <TableHead className="py-1">Tarifa Un.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {raw.srlItems.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="py-1">{item.month}</TableCell>
                    <TableCell className="py-1">{item.programId}</TableCell>
                    <TableCell className="py-1">{item.adType} {item.seconds ? `(${item.seconds}s)` : ''}</TableCell>
                    <TableCell className="py-1">${Number(item.unitRate || 0).toLocaleString('es-AR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {raw.sasItems && raw.sasItems.length > 0 && (
        <div>
          <span className="font-bold text-slate-800 block mb-1 text-xs uppercase text-primary">Detalle Digital AIRE SAS</span>
          <div className="border rounded overflow-hidden text-xs">
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="py-1">Mes</TableHead>
                  <TableHead className="py-1">Formato</TableHead>
                  <TableHead className="py-1">Dispositivos / Secciones</TableHead>
                  <TableHead className="py-1">Tarifa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {raw.sasItems.map((item: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="py-1">{item.month}</TableCell>
                    <TableCell className="py-1">{item.format} {item.cpm ? `(CPM: ${item.cpm})` : ''}</TableCell>
                    <TableCell className="py-1 text-[10px]">
                      {[item.desktop && 'Web', item.mobile && 'Móvil', item.home && 'Home', item.interiores && 'Notas'].filter(Boolean).join(' - ')}
                    </TableCell>
                    <TableCell className="py-1">${Number(item.unitRate || 0).toLocaleString('es-AR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 border-t pt-3">
        {raw.billingRequestsSrl && raw.billingRequestsSrl.length > 0 && (
          <div className="bg-slate-50 p-2.5 rounded border">
            <span className="font-bold text-slate-700 block text-xs mb-1">Cuotas de Facturación SRL</span>
            <div className="space-y-1 text-xs max-h-24 overflow-y-auto">
              {raw.billingRequestsSrl.map((br: any, i: number) => (
                <div key={i} className="flex justify-between border-b pb-0.5 last:border-0">
                  <span>{formatSafeDate(br.date)}:</span>
                  <span className="font-semibold">${Number(br.amount || 0).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {raw.billingRequestsSas && raw.billingRequestsSas.length > 0 && (
          <div className="bg-slate-50 p-2.5 rounded border">
            <span className="font-bold text-slate-700 block text-xs mb-1">Cuotas de Facturación SAS (C/IVA 5%)</span>
            <div className="space-y-1 text-xs max-h-24 overflow-y-auto">
              {raw.billingRequestsSas.map((br: any, i: number) => (
                <div key={i} className="flex justify-between border-b pb-0.5 last:border-0">
                  <span>{formatSafeDate(br.date)}:</span>
                  <span className="font-semibold">${Number(br.amount || 0).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {raw.observations && (
        <div className="p-2 bg-yellow-50 border border-yellow-200 text-xs rounded text-slate-700">
          <strong>Observaciones de la OP:</strong> {raw.observations}
        </div>
      )}
    </div>
  );

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
                  <Badge variant="outline" className={getTypeColor(item.type)}>{item.type}</Badge>
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

      {/* MODAL DE EVALUACIÓN COMPLETA (PANTALLA ANCHA) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              Auditoría Completa: <Badge className={getTypeColor(selectedItem?.type as any)}>{selectedItem?.type}</Badge>
            </DialogTitle>
            <DialogDescription>
              Valida la información enviada por el asesor técnico. Los campos vacíos fueron omitidos.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <ScrollArea className="flex-1 pr-3 max-h-[55vh]">
              <div className="space-y-5 py-2">
                
                {/* Cabecera Principal */}
                <div className="grid grid-cols-4 gap-4 text-xs bg-slate-100/60 p-3 rounded border">
                  <div><span className="text-muted-foreground block text-[10px] uppercase font-bold">Anunciante</span><span className="font-semibold text-sm">{selectedItem.clientName}</span></div>
                  <div><span className="text-muted-foreground block text-[10px] uppercase font-bold">Asesor Comercial</span><span className="font-semibold text-sm">{selectedItem.advisorName}</span></div>
                  <div><span className="text-muted-foreground block text-[10px] uppercase font-bold">Referencia Interna</span><span className="font-semibold text-sm text-slate-700">{selectedItem.title}</span></div>
                  <div><span className="text-muted-foreground block text-[10px] uppercase font-bold">Fecha de Carga</span><span className="font-semibold text-sm">{format(selectedItem.createdAt, 'dd/MM/yyyy HH:mm')}</span></div>
                </div>

                <Separator />

                {/* VISUALIZADORES INYECTADOS SEGÚN EL TIPO */}
                {selectedItem.type === 'Nota Comercial' && <RenderNotaComercialDetails raw={selectedItem.rawData} />}
                {selectedItem.type === 'Pedido de Redes' && <RenderPedidoRedesDetails raw={selectedItem.rawData} />}
                {selectedItem.type === 'Orden de Publicidad' && <RenderOrdenPublicidadDetails raw={selectedItem.rawData} />}

                <Separator />

                {/* Formulario de Decisión */}
                <div className="space-y-2 bg-slate-50/50 p-3 rounded border">
                  <Label htmlFor="comments" className="font-bold text-slate-800 text-sm">
                    Observaciones administrativas de devolución / aprobación
                  </Label>
                  <Textarea 
                    id="comments" 
                    placeholder="Escribe aquí los motivos específicos si decides devolver el pedido, o aclaraciones para pautado si lo apruebas..." 
                    value={adminComments}
                    onChange={(e) => setAdminComments(e.target.value)}
                    className="min-h-[70px] bg-white"
                  />
                  {actionType === 'Devuelto' && !adminComments.trim() && (
                    <span className="text-xs text-red-500 font-semibold block">⚠️ El motivo de devolución es obligatorio para guiar al asesor.</span>
                  )}
                </div>

                {actionType && (
                  <div className={`p-3 rounded border text-xs font-semibold ${actionType === 'Aprobado' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {actionType === 'Aprobado' 
                      ? 'Confirma la aprobación: el documento pasará al estado Aprobado y se liberará en los paneles oficiales del CRM.' 
                      : 'Confirma la devolución: el asesor podrá editar la información corregida en su panel para reenviarla.'
                    }
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4 border-t pt-3">
            {!actionType ? (
              <>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cerrar Visualizador</Button>
                <div className="flex gap-2 w-full sm:w-auto justify-end ml-auto">
                  <Button type="button" variant="destructive" onClick={() => setActionType('Devuelto')}>Devolver al Asesor</Button>
                  <Button type="button" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setActionType('Aprobado')}>Aprobar Contenido</Button>
                </div>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setActionType(null)} disabled={isSaving}>Volver al Detalle</Button>
                <Button 
                  type="button" 
                  onClick={submitEvaluation} 
                  disabled={isSaving || (actionType === 'Devuelto' && !adminComments.trim())} 
                  className={actionType === 'Aprobado' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                >
                  {isSaving ? <Spinner size="small" className="mr-2" /> : `Confirmar: Marcar como ${actionType}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
