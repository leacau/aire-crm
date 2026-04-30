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
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Eye, CheckCircle2, XCircle, Clock } from 'lucide-react';
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

function ApprovalsPageComponent() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [items, setItems] = useState<UnifiedApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para el Modal de Evaluación
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

  const fetchData = async () => {
    if (!userInfo) return;
    setLoading(true);
    try {
      const statusesToFetch: ApprovalStatus[] = ['Pendiente', 'Aprobado', 'Devuelto'];
      
      // Consultamos las 3 colecciones simultáneamente
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
          title: data.title || 'Nota S/T',
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
          title: data.product || 'Publicidad S/T',
          createdAt: parseDate(data.createdAt),
          status: data.status,
          adminComments: data.adminComments,
          collectionName: 'advertising_orders',
          rawData: data
        });
      });

      // Ordenar por fecha de creación (más nuevos primero)
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

      // 🟢 AQUÍ IRA LA LÓGICA DE ENVÍO DE CORREOS
      if (actionType === 'Aprobado') {
        // Ejemplo: 
        // await fetch('/api/send-note-email', { method: 'POST', body: JSON.stringify(selectedItem.rawData) });
        console.log("Simulando envío de correo a Pautado/Admin...");
      }

      toast({ title: `Documento ${actionType} correctamente.` });
      setIsModalOpen(false);
      fetchData(); // Refrescar lista
    } catch (error) {
      console.error("Error updating status:", error);
      toast({ title: "Error al actualizar", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || loading) {
    return <div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>;
  }

  const pendingItems = items.filter(i => i.status === 'Pendiente');
  const approvedItems = items.filter(i => i.status === 'Aprobado');
  const returnedItems = items.filter(i => i.status === 'Devuelto');

  const getTypeColor = (type: ApprovalItemType) => {
    switch(type) {
      case 'Nota Comercial': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Pedido de Redes': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'Orden de Publicidad': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800';
    }
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
                <TableCell className="text-muted-foreground">{item.title}</TableCell>
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

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <Header title="Bandeja de Aprobaciones" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Centro de Revisión</h2>
          <p className="text-muted-foreground">Administra y valida los documentos cargados por los asesores antes de enviarlos a Pautado.</p>
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

      {/* MODAL DE EVALUACIÓN */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Evaluar Documento</DialogTitle>
            <DialogDescription>
              Revisa la información básica. Para ver el documento completo, búscalo en su módulo correspondiente.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-md border">
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wider">TIPO DE DOCUMENTO</span>
                  <span className="font-semibold">{selectedItem.type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wider">CLIENTE</span>
                  <span className="font-semibold">{selectedItem.clientName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wider">ASESOR</span>
                  <span className="font-semibold">{selectedItem.advisorName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wider">REFERENCIA</span>
                  <span className="font-semibold">{selectedItem.title}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comments">Comentarios / Justificación (Obligatorio si devuelves)</Label>
                <Textarea 
                  id="comments" 
                  placeholder="Ej: Falta cargar el CUIT del cliente o el monto es incorrecto..." 
                  value={adminComments}
                  onChange={(e) => setAdminComments(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              {actionType && (
                <div className={`p-3 rounded-md border ${actionType === 'Aprobado' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  Estás a punto de <strong>{actionType === 'Aprobado' ? 'APROBAR' : 'DEVOLVER'}</strong> este documento. 
                  {actionType === 'Aprobado' && ' Se enviará el correo electrónico correspondiente.'}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            {!actionType ? (
              <>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  <Button type="button" variant="destructive" onClick={() => setActionType('Devuelto')}>Devolver al Asesor</Button>
                  <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={() => setActionType('Aprobado')}>Aprobar y Enviar</Button>
                </div>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setActionType(null)} disabled={isSaving}>Atrás</Button>
                <Button type="button" onClick={submitEvaluation} disabled={isSaving} className={actionType === 'Aprobado' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}>
                  {isSaving ? <Spinner size="small" className="mr-2" /> : 'Confirmar Acción'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <React.Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spinner size="large" /></div>}>
      <ApprovalsPageComponent />
    </React.Suspense>
  );
}
