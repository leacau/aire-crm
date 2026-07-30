'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BadgeCheck,
  BriefcaseBusiness,
  CalendarIcon,
  CheckCircle2,
  ClipboardList,
  ExternalLink,

  Loader2,
  PlusCircle,

  Send,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ClientCombobox } from '@/components/clients/client-combobox';
import { getAdvertisingOrdersByCanjeId } from '@/lib/api/canjes';
import { getAdvertisingOrderFinancialSummary } from '@/lib/advertising-order-utils';
import type { AdvertisingOrder, Canje, CanjeEstado, CanjeModalidad, CanjeTipo, Client, NecesidadResolucion, User } from '@/lib/types';
import { canjeEstados, canjeModalidades, canjeTipos, necesidadResoluciones } from '@/lib/types';

type NeedFormData = Omit<Canje, 'id' | 'fechaCreacion'>;
type WorkflowTab = 'pedido' | 'evaluacion' | 'gerencia' | 'gestion';

interface CanjeFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (canjeData: NeedFormData) => Promise<void>;
  canje?: Canje | null;
  clients: Client[];
  users: User[];
  currentUser: User;
}

const initialFormData = (): NeedFormData => ({
  titulo: '',
  solicitanteCanje: '',
  clienteId: undefined,
  clienteName: '',
  asesorId: undefined,
  asesorName: '',
  pedido: '',
  necesidadOrganizacion: '',
  fechaResolucion: undefined,
  facturas: [],
  valorAsociado: 0,
  valorCanje: 0,
  valorAcordado: 0,
  presupuestoValor: 0,
  presupuestoDetalle: '',
  tipoResolucion: 'Pendiente',
  decisionComentario: '',
  gerenciaComentario: '',
  gestionComentario: '',
  estado: 'Necesidad cargada',
  tipo: 'Una vez',
  modalidad: 'Factura contra factura',
  observaciones: '',
  historialMensual: [],
  advertisingOrderIds: [],
});

const getOrderValue = (order: AdvertisingOrder) => {
  if (Number.isFinite(Number(order.totalOrder)) && Number(order.totalOrder) > 0) return Number(order.totalOrder);
  const summary = getAdvertisingOrderFinancialSummary(order);
  return summary.srl.net + summary.sas.net;
};

const getLatestActiveOrder = (orders: AdvertisingOrder[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return [...orders]
    .filter(order => {
      const endDate = new Date(order.endDate);
      return !Number.isNaN(endDate.getTime()) && endDate >= today && (!order.status || ['Aprobado', 'Pendiente de Modificación'].includes(order.status));
    })
    .sort((a, b) => new Date(b.startDate || b.createdAt).getTime() - new Date(a.startDate || a.createdAt).getTime())[0];
};

const stepStyles: Record<string, string> = {
  active: 'border-primary bg-primary text-primary-foreground',
  done: 'border-green-500 bg-green-50 text-green-800',
  idle: 'border-slate-200 bg-white text-slate-600',
};

export function CanjeFormDialog({ isOpen, onOpenChange, onSave, canje = null, clients, users, currentUser }: CanjeFormDialogProps) {
  const [formData, setFormData] = useState<NeedFormData>(initialFormData());
  const [orders, setOrders] = useState<AdvertisingOrder[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkflowTab>('pedido');
  const { toast } = useToast();

  const isEditing = Boolean(canje);
  const canManageAll = ['Jefe', 'Gerencia', 'Administracion', 'Admin'].includes(currentUser.role);
  const isAssignedAdvisor = !formData.asesorId || formData.asesorId === currentUser.id;
  const canEdit = canManageAll || isAssignedAdvisor;
  const isCanje = formData.tipoResolucion === 'Canje' || formData.estado === 'Aprobado';
  const isDirectPurchase = formData.tipoResolucion === 'Compra directa';
  const isApproved = ['Aprobado gerencia', 'Aprobado'].includes(formData.estado);
  const isRejected = formData.estado === 'Rechazado gerencia';
  const hasEvaluation = isEditing && (canManageAll || formData.tipoResolucion !== 'Pendiente' || formData.estado !== 'Necesidad cargada');
  const hasManagementDecision = hasEvaluation && (canManageAll || ['Pendiente gerencia', 'Aprobado gerencia', 'Rechazado gerencia', 'Aprobado'].includes(formData.estado));
  const hasExecution = isEditing && (isApproved || isDirectPurchase || isCanje);

  const latestActiveOrder = useMemo(() => getLatestActiveOrder(orders), [orders]);
  const latestActiveValue = latestActiveOrder ? getOrderValue(latestActiveOrder) : 0;
  const budgetValue = Number(formData.presupuestoValor || formData.valorAcordado || 0);
  const hasValueMismatch = isCanje && latestActiveValue > 0 && budgetValue > 0 && Math.abs(latestActiveValue - budgetValue) > 0.01;

  useEffect(() => {
    if (!isOpen) return;
    const nextData = canje ? { ...initialFormData(), ...canje, tipoResolucion: canje.tipoResolucion || (canje.estado === 'Aprobado' ? 'Canje' : 'Pendiente') } : initialFormData();
    setFormData(nextData);
    setOrders([]);

    setIsSaving(false);
    setActiveTab('pedido');

    if (!canje?.id) return;
    setIsLoadingRelated(true);
    Promise.all([getAdvertisingOrdersByCanjeId(canje.id, canje.advertisingOrderIds || [])])
      .then(([relatedOrders]) => {
        setOrders(relatedOrders);
      })
      .catch(error => {
        console.error('Error loading need relations', error);
        toast({ title: 'No se pudieron cargar las órdenes o facturas relacionadas', variant: 'destructive' });
      })
      .finally(() => setIsLoadingRelated(false));
  }, [canje, isOpen, toast]);

  useEffect(() => {
    if (!latestActiveOrder) return;
    setFormData(previous => ({
      ...previous,
      valorCanje: latestActiveValue,
      advertisingOrderIds: Array.from(new Set(orders.map(order => order.id).filter(Boolean) as string[])),
    }));
  }, [latestActiveOrder, latestActiveValue, orders]);

  const availableTabs = useMemo<WorkflowTab[]>(() => {
    const tabs: WorkflowTab[] = ['pedido'];
    if (hasEvaluation) tabs.push('evaluacion');
    if (hasManagementDecision) tabs.push('gerencia');
    if (hasExecution) tabs.push('gestion');
    return tabs;
  }, [hasEvaluation, hasManagementDecision, hasExecution]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) setActiveTab('pedido');
  }, [activeTab, availableTabs]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData(previous => ({
      ...previous,
      [name]: ['valorAcordado', 'valorCanje', 'valorAsociado', 'presupuestoValor'].includes(name) ? Number(value) : value,
    }));
  };

  const handleClientSelection = (clientId: string) => {
    const client = clients.find(item => item.id === clientId);
    const owner = users.find(user => user.id === client?.ownerId);
    const assignedUser = currentUser.role === 'Asesor Canjes' ? currentUser : owner || currentUser;
    setFormData(previous => ({
      ...previous,
      clienteId: clientId,
      clienteName: client?.denominacion || client?.razonSocial || '',
      asesorId: assignedUser.id,
      asesorName: assignedUser.name,
    }));
  };

  const handleDateChange = (date?: Date) => {
    setFormData(previous => ({ ...previous, fechaResolucion: date ? format(date, 'yyyy-MM-dd') : undefined }));
  };

  const validate = () => {
    const missing = [
      !formData.titulo.trim() && 'Título',
      !formData.solicitanteCanje?.trim() && 'Persona o departamento solicitante',
      !formData.necesidadOrganizacion?.trim() && 'Necesidad',
      !formData.pedido.trim() && 'Detalle del pedido',
      !formData.fechaResolucion && 'Fecha de resolución',
      isCanje && !formData.clienteId && 'Cliente/proveedor del canje',
      isCanje && Number(formData.valorAcordado || 0) <= 0 && 'Valor acordado',
      hasValueMismatch && !formData.observaciones?.trim() && 'Observación por diferencia entre presupuesto y OP',
    ].filter(Boolean);
    if (missing.length) {
      toast({ title: 'Faltan datos', description: `Completa: ${missing.join(', ')}.`, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const save = async (nextData = formData, closeAfterSave = true) => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      await onSave(nextData);
      if (closeAfterSave) onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const saveAndGo = async (nextData: NeedFormData, tab: WorkflowTab) => {
    await save(nextData, false);
    setFormData(nextData);
    setActiveTab(tab);
  };

  const sendToEvaluation = async () => {
    await saveAndGo({ ...formData, estado: 'En evaluación' as CanjeEstado }, 'evaluacion');
  };

  const sendToManagement = async () => {
    if (formData.tipoResolucion === 'Pendiente') {
      toast({ title: 'Falta definición', description: 'Definí compra directa o canje antes de derivar.', variant: 'destructive' });
      return;
    }
    await saveAndGo({ ...formData, estado: 'Pendiente gerencia' as CanjeEstado }, 'gerencia');
  };

  const approve = async () => {
    const approvedData = { ...formData, estado: 'Aprobado gerencia' as CanjeEstado };
    await saveAndGo(approvedData, 'gestion');
    toast({ title: 'Necesidad aprobada', description: isCanje ? 'Ya se puede gestionar el canje y cargar la OP.' : 'Ya se puede gestionar la compra directa.' });
  };

  const reject = async () => {
    await saveAndGo({ ...formData, estado: 'Rechazado gerencia' as CanjeEstado }, 'gerencia');
  };

  const updateResolution = (value: NecesidadResolucion) => {
    setFormData(previous => ({
      ...previous,
      tipoResolucion: value,
      estado: value === 'Compra directa' ? 'Compra directa' : value === 'Canje' ? 'Pendiente gerencia' : 'En evaluación',
    }));
  };


  const createOrderHref = canje?.id && formData.clienteId ? `/publicidad/new?canjeId=${encodeURIComponent(canje.id)}&clientId=${encodeURIComponent(formData.clienteId)}` : '#';

  const StepChip = ({ tab, label, icon: Icon }: { tab: WorkflowTab; label: string; icon: typeof ClipboardList }) => {
    const visible = availableTabs.includes(tab);
    const active = activeTab === tab;
    const done = visible && availableTabs.indexOf(tab) < availableTabs.indexOf(activeTab);
    return (
      <button
        type="button"
        disabled={!visible}
        onClick={() => visible && setActiveTab(tab)}
        className={cn('flex min-w-[150px] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition', active ? stepStyles.active : done ? stepStyles.done : stepStyles.idle, !visible && 'cursor-not-allowed opacity-40')}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle>{isEditing ? 'Detalle de la necesidad' : 'Nueva necesidad de compra / contratación'}</DialogTitle>
              <DialogDescription>El proceso avanza por etapas. Cada usuario trabaja sobre el bloque que le corresponde.</DialogDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{formData.estado}</Badge>
              <Badge variant="secondary">{formData.tipoResolucion || 'Pendiente'}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="grid max-h-[76vh] gap-5 overflow-y-auto pr-2">
          <div className="grid gap-2 rounded-md border bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <StepChip tab="pedido" label="Carga de necesidad" icon={ClipboardList} />
            <StepChip tab="evaluacion" label="Recepción y definición" icon={Send} />
            <StepChip tab="gerencia" label="Gerencia / Directorio" icon={BadgeCheck} />
            <StepChip tab="gestion" label={isDirectPurchase ? 'Gestión de compra' : 'Gestión de canje'} icon={BriefcaseBusiness} />
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WorkflowTab)} className="space-y-4">
            <TabsList className="hidden">
              {availableTabs.map(tab => <TabsTrigger key={tab} value={tab}>{tab}</TabsTrigger>)}
            </TabsList>

            <TabsContent value="pedido" className="mt-0 space-y-4">
              <section className="space-y-4 rounded-md border bg-white p-4">
                <div>
                  <h3 className="text-base font-semibold">Carga de necesidad</h3>
                  <p className="text-sm text-muted-foreground">Datos del pedido original y presupuesto de referencia.</p>
                </div>
                <fieldset disabled={!canEdit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="titulo">Título de la necesidad</Label>
                      <Input id="titulo" name="titulo" value={formData.titulo} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="solicitanteCanje">Persona o Depto. que solicita</Label>
                      <Input id="solicitanteCanje" name="solicitanteCanje" value={formData.solicitanteCanje || ''} onChange={handleChange} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="necesidadOrganizacion">Necesidad que origina el pedido</Label>
                    <Textarea id="necesidadOrganizacion" name="necesidadOrganizacion" value={formData.necesidadOrganizacion || ''} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pedido">Detalle del pedido</Label>
                    <Textarea id="pedido" name="pedido" value={formData.pedido} onChange={handleChange} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Fecha de resolución necesaria</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" className={cn('w-full justify-start font-normal', !formData.fechaResolucion && 'text-muted-foreground')}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.fechaResolucion ? format(parseISO(formData.fechaResolucion), 'PPP', { locale: es }) : 'Seleccionar fecha'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={formData.fechaResolucion ? parseISO(formData.fechaResolucion) : undefined} onSelect={handleDateChange} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label>Tipo de pedido</Label>
                      <Select value={formData.tipo} onValueChange={(value: CanjeTipo) => setFormData(previous => ({ ...previous, tipo: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{canjeTipos.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="presupuestoValor">Presupuesto estimado total con IVA</Label>
                      <Input id="presupuestoValor" name="presupuestoValor" type="number" step="0.01" min={0} value={formData.presupuestoValor || ''} onChange={handleChange} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="presupuestoDetalle">Presupuestos / referencias recibidas</Label>
                    <Textarea id="presupuestoDetalle" name="presupuestoDetalle" value={formData.presupuestoDetalle || ''} onChange={handleChange} />
                  </div>
                </fieldset>
              </section>
            </TabsContent>

            <TabsContent value="evaluacion" className="mt-0 space-y-4">
              <section className="space-y-4 rounded-md border bg-white p-4">
                <div>
                  <h3 className="text-base font-semibold">Recepción y definición</h3>
                  <p className="text-sm text-muted-foreground">El receptor revisa el pedido, define compra directa o canje y lo deriva.</p>
                </div>
                <fieldset disabled={!canEdit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Resolución propuesta</Label>
                      <Select value={formData.tipoResolucion || 'Pendiente'} onValueChange={updateResolution}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{necesidadResoluciones.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="valorAcordado">Valor acordado total con IVA</Label>
                      <Input id="valorAcordado" name="valorAcordado" type="number" step="0.01" min={0} value={formData.valorAcordado || ''} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                      <Label>Modalidad</Label>
                      <Select value={formData.modalidad || 'Factura contra factura'} onValueChange={(value: CanjeModalidad) => setFormData(previous => ({ ...previous, modalidad: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{canjeModalidades.map(modality => <SelectItem key={modality} value={modality}>{modality === 'AVION' ? 'AVIÓN - sin facturación' : modality}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  {isCanje && (
                    <div className="space-y-2">
                      <Label>Cliente / proveedor del canje</Label>
                      <ClientCombobox clients={clients} value={formData.clienteId || ''} onChange={handleClientSelection} placeholder="Buscar cliente..." />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="decisionComentario">Comentario de evaluación</Label>
                    <Textarea id="decisionComentario" name="decisionComentario" value={formData.decisionComentario || ''} onChange={handleChange} />
                  </div>
                </fieldset>
              </section>
            </TabsContent>

            <TabsContent value="gerencia" className="mt-0 space-y-4">
              <section className="space-y-4 rounded-md border bg-white p-4">
                <div>
                  <h3 className="text-base font-semibold">Aprobación de gerencia / directorio</h3>
                  <p className="text-sm text-muted-foreground">Se registra la aprobación o rechazo sobre la compra o canje propuesto.</p>
                </div>
                <fieldset disabled={!canEdit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Estado del proceso</Label>
                      <Select value={formData.estado} disabled={!canEdit} onValueChange={(value: CanjeEstado) => setFormData(previous => ({ ...previous, estado: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{canjeEstados.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <Button type="button" onClick={approve} disabled={isSaving || !canEdit}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Aprobar
                      </Button>
                      <Button type="button" variant="outline" onClick={reject} disabled={isSaving || !canEdit}>
                        Rechazar
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gerenciaComentario">Comentario de gerencia</Label>
                    <Textarea id="gerenciaComentario" name="gerenciaComentario" value={formData.gerenciaComentario || ''} onChange={handleChange} />
                  </div>
                  {isRejected && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">La necesidad fue rechazada. El receptor puede ver el motivo y cerrar el circuito.</p>}
                </fieldset>
              </section>
            </TabsContent>

            <TabsContent value="gestion" className="mt-0 space-y-4">
              {isDirectPurchase && (
                <section className="space-y-4 rounded-md border bg-white p-4">
                  <div>
                    <h3 className="text-base font-semibold">Gestión de compra directa</h3>
                    <p className="text-sm text-muted-foreground">Detalle operativo para completar la compra o contratación aprobada.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gestionComentario">Gestión / resultado de compra</Label>
                    <Textarea id="gestionComentario" name="gestionComentario" disabled={!canEdit} value={formData.gestionComentario || ''} onChange={handleChange} />
                  </div>
                </section>
              )}

              {isCanje && (
                <section className="space-y-4 rounded-md border bg-white p-4">
                  <div>
                    <h3 className="text-base font-semibold">Gestión del canje</h3>
                    <p className="text-sm text-muted-foreground">Visualizá la autorización y vinculá la orden de publicidad que paga el canje.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="observaciones">Alcance del canje / observaciones</Label>
                    <Textarea id="observaciones" name="observaciones" disabled={!canEdit} value={formData.observaciones || ''} onChange={handleChange} />
                  </div>
                  <div className="grid gap-4 rounded-md bg-muted/40 p-4 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <p className="text-sm text-muted-foreground">Valor de OP activa vinculada</p>
                      <p className="text-2xl font-semibold">${latestActiveValue.toLocaleString('es-AR')}</p>
                      <p className="text-xs text-muted-foreground">
                        {latestActiveOrder ? `Tomado de la última OP activa, vigente hasta ${format(new Date(latestActiveOrder.endDate), 'dd/MM/yyyy')}.` : 'No hay una orden de publicidad activa relacionada.'}
                      </p>
                    </div>
                    <Button asChild={Boolean(canje?.id && formData.clienteId && isApproved)} disabled={!canje?.id || !formData.clienteId || !isApproved}>
                      {canje?.id && formData.clienteId && isApproved ? (
                        <Link href={createOrderHref}><PlusCircle className="mr-2 h-4 w-4" /> Carga de OP</Link>
                      ) : (
                        <span><PlusCircle className="mr-2 h-4 w-4" /> Carga de OP</span>
                      )}
                    </Button>
                  </div>
                  {!isEditing && <p className="text-sm text-muted-foreground">Primero guarda la necesidad para habilitar la vinculación de órdenes.</p>}
                  {isEditing && !isApproved && <p className="text-sm text-amber-700">La carga de OP se habilita cuando gerencia aprueba la necesidad.</p>}
                  {hasValueMismatch && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      El valor de la OP activa (${latestActiveValue.toLocaleString('es-AR')}) no coincide con el presupuesto (${budgetValue.toLocaleString('es-AR')}). Debe quedar una observación.
                    </p>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Órdenes vinculadas</h4>
                      {isLoadingRelated && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                    {!isLoadingRelated && orders.length === 0 && <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Todavía no hay órdenes vinculadas.</div>}
                    {orders.map(order => {

                      return (
                        <div key={order.id} className="rounded-md border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{order.product || order.opportunityTitle || 'Orden de publicidad'}</p>
                              <p className="text-sm text-muted-foreground">{format(new Date(order.startDate), 'dd/MM/yyyy')} al {format(new Date(order.endDate), 'dd/MM/yyyy')} · ${getOrderValue(order).toLocaleString('es-AR')}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" asChild><Link href={`/publicidad/${order.id}`}><ExternalLink className="mr-2 h-4 w-4" /> Ver detalle</Link></Button>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {activeTab === 'pedido' && isEditing && canEdit && <Button type="button" variant="outline" onClick={sendToEvaluation}>Enviar a recepción</Button>}
            {activeTab === 'evaluacion' && canEdit && <Button type="button" variant="outline" onClick={sendToManagement}>Derivar a gerencia</Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" onClick={() => save()} disabled={isSaving || !canEdit}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
