'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BadgeCheck,
  CalendarIcon,
  ExternalLink,
  FilePlus2,
  Loader2,
  PlusCircle,
  ReceiptText,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ClientCombobox } from '@/components/clients/client-combobox';
import {
  getAdvertisingOrdersByCanjeId,
  getInvoicesByCanjeId,
} from '@/lib/firebase-service';
import { getAdvertisingOrderFinancialSummary } from '@/lib/advertising-order-utils';
import type {
  AdvertisingOrder,
  Canje,
  CanjeEstado,
  CanjeModalidad,
  CanjeTipo,
  Client,
  Invoice,
  User,
} from '@/lib/types';
import { canjeEstados, canjeModalidades, canjeTipos } from '@/lib/types';

type CanjeFormData = Omit<Canje, 'id' | 'fechaCreacion'>;

interface CanjeFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (canjeData: CanjeFormData) => Promise<void>;
  canje?: Canje | null;
  clients: Client[];
  users: User[];
  currentUser: User;
}

const initialFormData = (): CanjeFormData => ({
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
  estado: 'Pedido',
  tipo: 'Una vez',
  modalidad: 'Factura contra factura',
  observaciones: '',
  historialMensual: [],
  advertisingOrderIds: [],
});

const getOrderValue = (order: AdvertisingOrder) => {
  if (Number.isFinite(Number(order.totalOrder)) && Number(order.totalOrder) > 0) {
    return Number(order.totalOrder);
  }
  const summary = getAdvertisingOrderFinancialSummary(order);
  return summary.srl.net + summary.sas.net;
};

const getLatestActiveOrder = (orders: AdvertisingOrder[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return [...orders]
    .filter(order => {
      const endDate = new Date(order.endDate);
      return !Number.isNaN(endDate.getTime())
        && endDate >= today
        && (!order.status || ['Aprobado', 'Pendiente de Modificación'].includes(order.status));
    })
    .sort((a, b) => new Date(b.startDate || b.createdAt).getTime() - new Date(a.startDate || a.createdAt).getTime())[0];
};

export function CanjeFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  canje = null,
  clients,
  users,
  currentUser,
}: CanjeFormDialogProps) {
  const [formData, setFormData] = useState<CanjeFormData>(initialFormData());
  const [orders, setOrders] = useState<AdvertisingOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const { toast } = useToast();

  const isEditing = Boolean(canje);
  const canManageAll = ['Jefe', 'Gerencia', 'Administracion', 'Admin'].includes(currentUser.role);
  const isAssignedAdvisor = !formData.asesorId || formData.asesorId === currentUser.id;
  const canEditAgreement = canManageAll || isAssignedAdvisor;
  const isApproved = formData.estado === 'Aprobado';

  const latestActiveOrder = useMemo(() => getLatestActiveOrder(orders), [orders]);
  const latestActiveValue = latestActiveOrder ? getOrderValue(latestActiveOrder) : 0;

  useEffect(() => {
    if (!isOpen) return;
    setFormData(canje ? { ...initialFormData(), ...canje } : initialFormData());
    setOrders([]);
    setInvoices([]);
    setIsSaving(false);

    if (!canje?.id) return;
    setIsLoadingRelated(true);
    Promise.all([
      getAdvertisingOrdersByCanjeId(canje.id, canje.advertisingOrderIds || []),
      getInvoicesByCanjeId(canje.id),
    ])
      .then(([relatedOrders, relatedInvoices]) => {
        setOrders(relatedOrders);
        setInvoices(relatedInvoices);
      })
      .catch(error => {
        console.error('Error loading canje relations', error);
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData(previous => ({
      ...previous,
      [name]: ['valorAcordado', 'valorCanje', 'valorAsociado'].includes(name) ? Number(value) : value,
    }));
  };

  const handleClientSelection = (clientId: string) => {
    const client = clients.find(item => item.id === clientId);
    const owner = users.find(user => user.id === client?.ownerId);
    const assignedUser = currentUser.role === 'Asesor Canjes' ? currentUser : owner || currentUser;
    setFormData(previous => ({
      ...previous,
      clienteId: clientId,
      clienteName: client?.denominacion || '',
      asesorId: assignedUser.id,
      asesorName: assignedUser.name,
    }));
  };

  const handleDateChange = (date?: Date) => {
    setFormData(previous => ({
      ...previous,
      fechaResolucion: date ? format(date, 'yyyy-MM-dd') : undefined,
    }));
  };

  const validate = () => {
    const missing = [
      !formData.titulo.trim() && 'Título',
      !formData.solicitanteCanje?.trim() && 'Persona o departamento solicitante',
      !formData.necesidadOrganizacion?.trim() && 'Necesidad',
      !formData.pedido.trim() && 'Detalle del pedido',
      !formData.clienteId && 'Cliente',
      !formData.fechaResolucion && 'Fecha de resolución',
      Number(formData.valorAcordado || 0) <= 0 && 'Valor acordado',
    ].filter(Boolean);
    if (missing.length) {
      toast({
        title: 'Faltan datos',
        description: `Completa: ${missing.join(', ')}.`,
        variant: 'destructive',
      });
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

  const approve = async () => {
    const approvedData = { ...formData, estado: 'Aprobado' as CanjeEstado };
    setFormData(approvedData);
    await save(approvedData, false);
    toast({ title: 'Canje aprobado', description: 'Ya se puede crear la orden de publicidad relacionada.' });
  };

  const invoicesForOrder = (orderId?: string) => invoices.filter(invoice => invoice.orderId === orderId);
  const createOrderHref = canje?.id && formData.clienteId
    ? `/publicidad/new?canjeId=${encodeURIComponent(canje.id)}&clientId=${encodeURIComponent(formData.clienteId)}`
    : '#';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Detalle del canje' : 'Nuevo pedido de canje'}</DialogTitle>
          <DialogDescription>
            El canje reúne la necesidad, el acuerdo, las órdenes de publicidad y sus facturas.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[72vh] gap-5 overflow-y-auto pr-2">
          <fieldset disabled={!canEditAgreement} className="space-y-4 rounded-md border p-4">
            <legend className="px-1 font-semibold text-primary">1. Pedido de Canje</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="titulo">Título del Canje</Label>
                <Input id="titulo" name="titulo" value={formData.titulo} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="solicitanteCanje">Persona o Depto. que solicita el canje</Label>
                <Input id="solicitanteCanje" name="solicitanteCanje" value={formData.solicitanteCanje || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="necesidadOrganizacion">Necesidad que origina el canje</Label>
              <Textarea id="necesidadOrganizacion" name="necesidadOrganizacion" value={formData.necesidadOrganizacion || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pedido">Detalle del pedido</Label>
              <Textarea id="pedido" name="pedido" value={formData.pedido} onChange={handleChange} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Fecha de Resolución Necesaria</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className={cn('w-full justify-start font-normal', !formData.fechaResolucion && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.fechaResolucion
                        ? format(parseISO(formData.fechaResolucion), 'PPP', { locale: es })
                        : 'Seleccionar fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={formData.fechaResolucion ? parseISO(formData.fechaResolucion) : undefined} onSelect={handleDateChange} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Canje</Label>
                <Select value={formData.tipo} onValueChange={(value: CanjeTipo) => setFormData(previous => ({ ...previous, tipo: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{canjeTipos.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cliente del acuerdo</Label>
                <ClientCombobox
                  clients={clients}
                  value={formData.clienteId || ''}
                  onChange={handleClientSelection}
                  placeholder="Buscar cliente..."
                />
              </div>
            </div>
          </fieldset>

          <fieldset disabled={!canEditAgreement} className="space-y-4 rounded-md border p-4">
            <legend className="px-1 font-semibold text-primary">2. Acuerdo económico</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="valorAcordado">Valor acordado total con IVA</Label>
                <Input id="valorAcordado" name="valorAcordado" type="number" min={0} value={formData.valorAcordado || ''} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <Label>Modalidad</Label>
                <Select value={formData.modalidad || 'Factura contra factura'} onValueChange={(value: CanjeModalidad) => setFormData(previous => ({ ...previous, modalidad: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {canjeModalidades.map(modality => (
                      <SelectItem key={modality} value={modality}>
                        {modality === 'AVION' ? 'AVIÓN - sin facturación' : modality}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4 rounded-md border p-4">
            <legend className="px-1 font-semibold text-primary">3. Contraprestación y órdenes de publicidad</legend>
            <div className="space-y-2">
              <Label htmlFor="observaciones">Contraprestación / Observaciones</Label>
              <Textarea id="observaciones" name="observaciones" disabled={!canEditAgreement} value={formData.observaciones || ''} onChange={handleChange} />
            </div>

            <div className="grid gap-4 rounded-md bg-muted/40 p-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="text-sm text-muted-foreground">Valor Canje</p>
                <p className="text-2xl font-semibold">${latestActiveValue.toLocaleString('es-AR')}</p>
                <p className="text-xs text-muted-foreground">
                  {latestActiveOrder
                    ? `Tomado de la última OP activa, vigente hasta ${format(new Date(latestActiveOrder.endDate), 'dd/MM/yyyy')}.`
                    : 'No hay una orden de publicidad activa relacionada.'}
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

            {!isEditing && <p className="text-sm text-muted-foreground">Primero guarda el pedido para habilitar la vinculación de órdenes.</p>}
            {isEditing && !isApproved && <p className="text-sm text-amber-700">La carga de OP se habilita cuando el canje es aprobado.</p>}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Órdenes vinculadas</h4>
                {isLoadingRelated && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {!isLoadingRelated && orders.length === 0 && (
                <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Todavía no hay órdenes vinculadas.</div>
              )}
              {orders.map(order => {
                const orderInvoices = invoicesForOrder(order.id);
                return (
                  <div key={order.id} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{order.product || order.opportunityTitle || 'Orden de publicidad'}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(order.startDate), 'dd/MM/yyyy')} al {format(new Date(order.endDate), 'dd/MM/yyyy')}
                          {' · '}${getOrderValue(order).toLocaleString('es-AR')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" asChild>
                          <Link href={`/publicidad/${order.id}`}><ExternalLink className="mr-2 h-4 w-4" /> Ver detalle</Link>
                        </Button>
                        {formData.modalidad !== 'AVION' && (
                          <Button type="button" variant="outline" size="sm" asChild>
                            <Link href={`/invoices?canjeId=${encodeURIComponent(canje?.id || '')}&orderId=${encodeURIComponent(order.id || '')}&clientId=${encodeURIComponent(order.clientId)}&opportunityId=${encodeURIComponent(order.opportunityId || '')}`}>
                              <FilePlus2 className="mr-2 h-4 w-4" /> Cargar factura
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                    {formData.modalidad !== 'AVION' && (
                      <div className="mt-3 border-t pt-3">
                        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Facturas relacionadas</p>
                        {orderInvoices.length ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {orderInvoices.map(invoice => (
                              <div key={invoice.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                                <span><ReceiptText className="mr-2 inline h-4 w-4" />{invoice.invoiceNumber}</span>
                                <span className="font-medium">${Number(invoice.amount || 0).toLocaleString('es-AR')}</span>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-sm text-muted-foreground">Sin facturas cargadas para esta orden.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-4 rounded-md border p-4">
            <legend className="px-1 font-semibold text-primary">4. Estado y aprobación</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado del Proceso</Label>
                <Select
                  value={formData.estado}
                  disabled={!canEditAgreement}
                  onValueChange={(value: CanjeEstado) => setFormData(previous => ({ ...previous, estado: value }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {canjeEstados
                      .filter(state => canManageAll || state !== 'Aprobado')
                      .map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                {isApproved ? (
                  <div className="flex h-10 w-full items-center rounded-md border border-green-200 bg-green-50 px-3 text-sm font-medium text-green-800">
                    <BadgeCheck className="mr-2 h-4 w-4" /> Aprobado para crear órdenes de publicidad
                  </div>
                ) : canManageAll && isEditing ? (
                  <Button type="button" className="w-full" onClick={approve} disabled={isSaving}>
                    <BadgeCheck className="mr-2 h-4 w-4" /> Aprobar canje
                  </Button>
                ) : (
                  <div className="flex h-10 w-full items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                    Pendiente de aprobación para avanzar
                  </div>
                )}
              </div>
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={() => save()} disabled={isSaving || !canEditAgreement}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
