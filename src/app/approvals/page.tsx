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
import { Eye, CheckCircle2, XCircle, Clock, FileText, Share2, Film, Radio } from 'lucide-react';
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
          status: data.status || 'Pendiente',
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
      toast({ title: "Falta justificación", description: "Debes escribir el motivo de la devolución.", variant: "destructive" });
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

  // 🟢 VISUALIZADOR 1: NOTA COMERCIAL
  const RenderNotaComercialDetails = ({ raw }: { raw: any }) => (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-4 bg-slate-50 p-3 rounded border">
        <div><span className="text-muted-foreground text-xs block">VALOR TOTAL TARIFARIO</span><span className="font-bold">${Number(raw.totalValue || 0).toLocaleString('es-AR')}</span></div>
        <div><span className="text-muted-foreground text-xs block">VALOR VENTA REAL</span><span className="font-bold text-blue-600">${Number(raw.saleValue || 0).toLocaleString('es-AR')}</span></div>
        <div><span className="text-muted-foreground text-xs block">DESAJUSTE / BONIF.</span><span className={`font-bold ${raw.mismatch > 0 ? 'text-red-500' : 'text-slate-700'}`}>${Number(raw.mismatch || 0).toLocaleString('es-AR')}</span></div>
      </div>
      {raw.financialObservations && <div className="bg-amber-50 p-2 border border-amber-200 rounded text-xs text-amber-900"><strong>Obs. Financieras:</strong> {raw.financialObservations}</div>}
      <div>
        <h4 className="font-bold text-slate-800 flex items-center gap-1 mb-2"><Film className="w-4 h-4 text-blue-500"/> Zócalos / Grafs de Pantalla</h4>
        <div className="space-y-2">
          <div className="p-2 bg-slate-900 text-slate-100 font-mono rounded text-xs"><span className="text-yellow-400 block text-[10px]">TITULAR PRINCIPAL (Max 84 chr):</span>{raw.primaryGrafs?.join(' / ') || raw.primaryGraf || '-'}</div>
          <div className="p-2 bg-slate-900 text-slate-100 font-mono rounded text-xs"><span className="text-yellow-400 block text-[10px]">NOMBRE / FUNCIÓN (Max 55 chr):</span>{raw.secondaryGrafs?.join(' / ') || raw.secondaryGraf || '-'}</div>
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
    </div>
  );

  // 🟢 VISUALIZADOR 2: PEDIDO DE REDES
  const RenderPedidoRedesDetails = ({ raw }: { raw: any }) => (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="p-2 border rounded bg-slate-50"><strong>FORMATO:</strong> {raw.contentType}</div>
        <div className="p-2 border rounded bg-slate-50"><strong>EQUIPO CREADOR:</strong> {raw.creator}</div>
        <div className="p-2 border rounded bg-slate-50"><strong>PUBLICA SUGERIDA:</strong> {formatSafeDate(raw.publishDate)}</div>
      </div>
      {raw.contentType === 'Reel' && <div className="grid grid-cols-3 gap-2 bg-amber-50/50 p-2 border border-dashed rounded text-xs"><div><strong>Lugar Grabación:</strong> {raw.recordingLocation || '-'}</div><div><strong>Fecha Grabación:</strong> {formatSafeDate(raw.recordingDate)}</div><div><strong>Hora:</strong> {raw.recordingTime || '-'}</div></div>}
      <div><Label className="font-bold text-slate-700 block mb-1">Objetivo Estratégico de la Publicación</Label><div className="p-2.5 bg-slate-50 rounded border text-xs text-slate-700 whitespace-pre-wrap">{raw.objective}</div></div>
      <div><Label className="font-bold text-slate-700 block mb-1">Idea de Guion / Instrucciones</Label><div className="p-2.5 bg-slate-50 rounded border text-xs text-slate-700 whitespace-pre-wrap">{raw.script || 'Sin detalles'}</div></div>
      {(raw.contentType === 'Reel' || raw.contentType === 'Carrusel') && raw.reelCopy && (<div><Label className="font-bold text-pink-700 block mb-1">Texto del Copy (Feed)</Label><div className="p-2.5 bg-pink-50/30 border border-pink-100 rounded text-xs text-slate-800 whitespace-pre-wrap font-mono">{raw.reelCopy}</div></div>)}
    </div>
  );

  // 🟢 VISUALIZADOR 3: MATRIZ COMPLETA DE ORDEN DE PUBLICIDAD (Estilo Planilla de Medios)
  const RenderOrdenPublicidadDetails = ({ raw }: { raw: any }) => {
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

    return (
      <div className="space-y-5 text-sm">
        {/* Ficha Principal */}
        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/60 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div><span className="text-muted-foreground block text-[10px] uppercase">Anunciante</span><span className="font-bold text-slate-800 text-sm">{raw.clientName}</span></div>
          <div><span className="text-muted-foreground block text-[10px] uppercase">Agencia</span><span className="font-semibold text-slate-700">{raw.agencyName || 'Directo'}</span></div>
          <div><span className="text-muted-foreground block text-[10px] uppercase">Orden Tango</span><span className="font-mono font-bold text-blue-600 text-sm">{raw.tangoOrderNo || 'PENDIENTE'}</span></div>
          <div><span className="text-muted-foreground block text-[10px] uppercase">Vigencia Campaña</span><span className="font-semibold text-slate-700">{formatSafeDate(raw.startDate)} al {formatSafeDate(raw.endDate)}</span></div>
          <div className="sm:col-span-2"><span className="text-muted-foreground block text-[10px] uppercase">Enlaces de Materiales</span><span className="block truncate font-mono text-blue-500 text-[11px]">{raw.materialUrls?.join(' , ') || raw.materialUrl || 'No enviados'}</span></div>
        </div>

        {/* Planilla de Medios SRL (Matriz Horizontal Completa del 1 al 31) */}
        {raw.srlItems && raw.srlItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-1">
              <span className="font-bold text-slate-900 flex items-center gap-1 text-xs uppercase tracking-wider text-purple-800"><Radio className="w-4 h-4"/> Pauta Radial / Tanda - AIRE SRL</span>
            </div>

            {(() => {
              // Agrupar pautas por mes de emisión
              const itemsByMonth: Record<string, any[]> = {};
              raw.srlItems.forEach((item: any) => {
                if (!itemsByMonth[item.month]) itemsByMonth[item.month] = [];
                itemsByMonth[item.month].push(item);
              });

              return Object.entries(itemsByMonth).map(([month, monthItems]) => (
                <div key={month} className="space-y-1.5 border rounded-lg p-2.5 bg-white shadow-sm">
                  <div className="font-bold text-[11px] bg-purple-50 border border-purple-100 text-purple-800 px-2 py-0.5 rounded inline-block uppercase font-sans">
                    Ciclo Mensual: {month}
                  </div>
                  
                  <div className="overflow-x-auto border rounded-md">
                    <Table className="min-w-[1000px] table-fixed text-center border-collapse">
                      <TableHeader className="bg-slate-100/80 text-[10px] uppercase tracking-wider text-slate-700">
                        <TableRow className="h-7">
                          <TableHead className="w-32 text-left py-0 h-7 font-bold pl-2">Programa</TableHead>
                          <TableHead className="w-16 py-0 h-7 font-bold">Tipo</TableHead>
                          <TableHead className="w-10 py-0 h-7 font-bold">TV</TableHead>
                          <TableHead className="w-10 py-0 h-7 font-bold">Seg</TableHead>
                          {days.map(d => (
                            <TableHead key={d} className="p-0 h-7 text-center font-bold w-6 border-l border-slate-200">{d}</TableHead>
                          ))}
                          <TableHead className="w-12 py-0 h-7 font-bold border-l border-slate-300 bg-slate-50">Cant</TableHead>
                          <TableHead className="w-16 py-0 h-7 font-bold bg-slate-50">T. Unit</TableHead>
                          <TableHead className="w-20 py-0 h-7 font-bold text-right pr-2 bg-purple-50/50">Neto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-[11px] font-mono border-t">
                        {monthItems.map((item: any, idx: number) => {
                          const totalSpots = Object.values(item.dailySpots || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0);
                          const multiplier = item.adType === "Spot" ? (item.seconds || 0) : 1;
                          const rowNet = (item.unitRate || 0) * totalSpots * multiplier;

                          return (
                            <TableRow key={idx} className="hover:bg-slate-50/70 h-7">
                              <TableCell className="text-left py-0.5 h-7 font-sans font-medium truncate max-w-[120px] pl-2">{item.programId}</TableCell>
                              <TableCell className="py-0.5 h-7 font-sans">{item.adType}</TableCell>
                              <TableCell className="py-0.5 h-7 font-sans text-center">{item.hasTv ? 'SI' : 'NO'}</TableCell>
                              <TableCell className="py-0.5 h-7 text-slate-500">{item.seconds || '-'}</TableCell>
                              {days.map(d => {
                                const val = item.dailySpots?.[d.toString()];
                                return (
                                  <TableCell key={d} className={`p-0 h-7 text-center border-l border-slate-100 ${val ? 'bg-amber-100/70 font-bold text-amber-950 text-xs' : 'text-slate-200'}`}>
                                    {val || '-'}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="py-0.5 h-7 font-sans font-bold bg-slate-100 border-l border-slate-300 text-slate-800 text-center">{totalSpots}</TableCell>
                              <TableCell className="py-0.5 h-7 font-sans text-slate-600">${Number(item.unitRate || 0).toLocaleString('es-AR')}</TableCell>
                              <TableCell className="py-0.5 h-7 font-sans font-bold text-right pr-2 text-purple-950 bg-purple-50/30">${rowNet.toLocaleString('es-AR')}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {/* Planilla SAS - Banners Digitales */}
        {raw.sasItems && raw.sasItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b pb-1">
              <span className="font-bold text-slate-900 flex items-center gap-1 text-xs uppercase tracking-wider text-indigo-800"><Share2 className="w-4 h-4"/> Cobertura Digital - AIRE SAS</span>
            </div>
            <div className="border rounded-md overflow-hidden bg-white shadow-sm text-xs">
              <Table>
                <TableHeader className="bg-slate-50 text-slate-700">
                  <TableRow>
                    <TableHead>Mes Ciclo</TableHead>
                    <TableHead>Formato Comercial</TableHead>
                    <TableHead>Dispositivos y Secciones</TableHead>
                    <TableHead className="text-right pr-4">Monto Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {raw.sasItems.map((item: any, idx: number) => {
                    let net = item.format === "Banner" ? ((item.cpm || 0) * (item.unitRate || 0)) : (item.unitRate || 0);
                    return (
                      <TableRow key={idx} className="hover:bg-slate-50/50">
                        <TableCell className="font-semibold text-slate-700">{item.month}</TableCell>
                        <TableCell>
                          <span className="font-bold text-slate-900">{item.format}</span>
                          {item.detail && <span className="text-muted-foreground block text-[10px] italic">{item.detail}</span>}
                        </TableCell>
                        <TableCell className="text-[11px] text-slate-600">
                          {[item.desktop && 'Escritorio', item.mobile && 'Móvil', item.home && 'Home Principal', item.interiores && 'Notas / Interiores'].filter(Boolean).join(' • ')}
                          {item.url && <span className="text-blue-500 block font-mono text-[10px] truncate max-w-xs">{item.url}</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold pr-4 text-indigo-950">${net.toLocaleString('es-AR')}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Facturaciones Cronológicas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
          {raw.billingRequestsSrl && raw.billingRequestsSrl.length > 0 && (
            <div className="bg-slate-50 p-3 rounded-md border">
              <span className="font-bold text-slate-700 block text-[11px] uppercase mb-2 tracking-wide text-purple-900">Sugerencias Facturación SRL</span>
              <div className="space-y-1 text-xs">
                {raw.billingRequestsSrl.map((br: any, i: number) => (
                  <div key={i} className="flex justify-between bg-white border px-2 py-1 rounded shadow-xs font-mono">
                    <span className="font-sans text-slate-600">F: {formatSafeDate(br.date)}</span>
                    <span className="font-bold text-slate-900">${Number(br.amount || 0).toLocaleString('es-AR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {raw.billingRequestsSas && raw.billingRequestsSas.length > 0 && (
            <div className="bg-slate-50 p-3 rounded-md border">
              <span className="font-bold text-slate-700 block text-[11px] uppercase mb-2 tracking-wide text-indigo-900">Sugerencias Facturación SAS (C/IVA)</span>
              <div className="space-y-1 text-xs">
                {raw.billingRequestsSas.map((br: any, i: number) => (
                  <div key={i} className="flex justify-between bg-white border px-2 py-1 rounded shadow-xs font-mono">
                    <span className="font-sans text-slate-600">F: {formatSafeDate(br.date)}</span>
                    <span className="font-bold text-slate-900">${Number(br.amount || 0).toLocaleString('es-AR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

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

      {/* MODAL DE AUDITORÍA INTEGRAL EN PANTALLA ANCHA (MAX-W-4XL) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              Auditoría de Documento: <Badge className={getTypeColor(selectedItem?.type as any)}>{selectedItem?.type}</Badge>
            </DialogTitle>
            <DialogDescription>
              Verifique minuciosamente la planilla de medios y las sugerencias de facturación antes de tomar una decisión.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <ScrollArea className="flex-1 pr-2 max-h-[60vh]">
              <div className="space-y-4 py-2">
                
                {/* Metadatos Rápidos */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-100 p-3 rounded-md border">
                  <div><span className="text-muted-foreground block text-[9px] uppercase font-bold">Razón Social</span><span className="font-semibold text-sm truncate block">{selectedItem.clientName}</span></div>
                  <div><span className="text-muted-foreground block text-[9px] uppercase font-bold">Asesor Comercial</span><span className="font-semibold text-sm">{selectedItem.advisorName}</span></div>
                  <div><span className="text-muted-foreground block text-[9px] uppercase font-bold">Campaña / Ref</span><span className="font-semibold text-sm text-slate-700 truncate block">{selectedItem.title}</span></div>
                  <div><span className="text-muted-foreground block text-[9px] uppercase font-bold">Fecha Envío</span><span className="font-semibold text-sm">{format(selectedItem.createdAt, 'dd/MM/yyyy HH:mm')}</span></div>
                </div>

                <Separator />

                {/* INYECCIÓN DE LA PLANILLA COMPLETA SEGÚN EL FORMULARIO */}
                {selectedItem.type === 'Nota Comercial' && <RenderNotaComercialDetails raw={selectedItem.rawData} />}
                {selectedItem.type === 'Pedido de Redes' && <RenderPedidoRedesDetails raw={selectedItem.rawData} />}
                {selectedItem.type === 'Orden de Publicidad' && <RenderOrdenPublicidadDetails raw={selectedItem.rawData} />}

                <Separator />

                {/* Panel Operativo de Aprobación */}
                <div className="space-y-2 bg-slate-50 p-3 rounded-md border">
                  <Label htmlFor="comments" className="font-bold text-slate-800 text-sm">
                    Devolución / Observaciones Administrativas (Obligatorio en Devoluciones)
                  </Label>
                  <Textarea 
                    id="comments" 
                    placeholder="Escriba los motivos del rechazo técnico para notificar al asesor, o comentarios internos para el departamento de pautado..." 
                    value={adminComments}
                    onChange={(e) => setAdminComments(e.target.value)}
                    className="min-h-[60px] bg-white text-xs"
                  />
                  {actionType === 'Devuelto' && !adminComments.trim() && (
                    <span className="text-xs text-red-500 font-bold block">⚠️ Debe ingresar la justificación para proceder con la devolución.</span>
                  )}
                </div>

                {actionType && (
                  <div className={`p-2.5 rounded border text-xs font-semibold ${actionType === 'Aprobado' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {actionType === 'Aprobado' 
                      ? '✓ Confirmar aprobación: El pedido será validado e ingresará formalmente en las grillas finales del sistema.' 
                      : '✕ Confirmar devolución: El trámite regresará al panel del asesor comercial en estado corregible.'
                    }
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2 border-t pt-3">
            {!actionType ? (
              <>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cerrar Auditoría</Button>
                <div className="flex gap-2 w-full sm:w-auto justify-end ml-auto">
                  <Button type="button" variant="destructive" onClick={() => setActionType('Devuelto')}>Devolver al Asesor</Button>
                  <Button type="button" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setActionType('Aprobado')}>Aprobar y Registrar</Button>
                </div>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setActionType(null)} disabled={isSaving}>Atrás</Button>
                <Button 
                  type="button" 
                  onClick={submitEvaluation} 
                  disabled={isSaving || (actionType === 'Devuelto' && !adminComments.trim())} 
                  className={actionType === 'Aprobado' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
                >
                  {isSaving ? <Spinner size="small" className="mr-2" /> : `Confirmar Registro`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
