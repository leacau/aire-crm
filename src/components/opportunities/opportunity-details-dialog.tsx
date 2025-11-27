

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { opportunityStages } from '@/lib/data';
import type { Opportunity, OpportunityStage, BonificacionEstado, Agency, Periodicidad, FormaDePago, ProposalFile, OrdenPautado, InvoiceStatus, Invoice, ProposalItem } from '@/lib/types';
import { periodicidadOptions, formaDePagoOptions, invoiceStatusOptions } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth.tsx';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAgencies, createAgency, getInvoicesForOpportunity, createInvoice, updateInvoice, deleteInvoice, createOpportunity } from '@/lib/firebase-service';
import { PlusCircle, Clock, Trash2, FileText, Save, Calculator, CalendarIcon } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { TaskFormDialog } from './task-form-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrdenPautadoFormDialog } from './orden-pautado-form-dialog';
import { getNormalizedInvoiceNumber, sanitizeInvoiceNumber } from '@/lib/invoice-utils';
import { CommentThread } from '@/components/comments/comment-thread';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';

interface OpportunityDetailsDialogProps {
  opportunity: Opportunity | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUpdate: (opportunity: Partial<Opportunity>) => void;
  onCreate?: (opportunity: Omit<Opportunity, 'id'>, pendingInvoices: Omit<Invoice, 'id' | 'opportunityId'>[]) => void;
  client?: {id: string, name: string, ownerName?: string, ownerId?: string}
}

const getInitialOpportunityData = (client: any): Omit<Opportunity, 'id'> => ({
    title: '',
    details: '',
    value: 0,
    stage: 'Nuevo',
    observaciones: '',
    closeDate: new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(), // This will be overwritten by serverTimestamp
    clientName: client?.name || '',
    clientId: client?.id || '',
    bonificacionDetalle: '',
    periodicidad: [],
    facturaPorAgencia: false,
    formaDePago: [],
    fechaFacturacion: '',
    proposalFiles: [],
    ordenesPautado: [],
    proposalItems: [],
    valorTarifario: 0,
});

const NewAgencyDialog = ({ onAgencyCreated }: { onAgencyCreated: (newAgency: Agency) => void }) => {
    const { userInfo } = useAuth();
    const { toast } = useToast();
    const [agencyName, setAgencyName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const handleCreateAgency = async () => {
        if (!agencyName.trim() || !userInfo) return;
        setIsSaving(true);
        try {
            const newAgencyId = await createAgency({ name: agencyName.trim() }, userInfo.id, userInfo.name);
            const newAgency = { id: newAgencyId, name: agencyName.trim() };
            toast({ title: "Agencia Creada" });
            onAgencyCreated(newAgency);
            setIsOpen(false);
            setAgencyName('');
        } catch (error) {
            console.error("Error creating agency", error);
            toast({ title: "Error al crear la agencia", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" className="w-full justify-start mt-1">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Crear nueva agencia
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Nueva Agencia de Publicidad</AlertDialogTitle>
                    <AlertDialogDescription>
                        Introduce el nombre de la nueva agencia.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                    <Label htmlFor="agency-name">Nombre de la Agencia</Label>
                    <Input
                        id="agency-name"
                        value={agencyName}
                        onChange={(e) => setAgencyName(e.target.value)}
                        placeholder="Ej: Publicidad Creativa S.A."
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCreateAgency} disabled={isSaving}>
                        {isSaving ? <Spinner size="small" /> : 'Crear'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export function OpportunityDetailsDialog({
  opportunity,
  isOpen,
  onOpenChange,
  onUpdate,
  onCreate = () => {},
  client
}: OpportunityDetailsDialogProps) {
  const { userInfo, isBoss, getGoogleAccessToken } = useAuth();
  const { toast } = useToast();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isOrdenPautadoFormOpen, setIsOrdenPautadoFormOpen] = useState(false);
  const [selectedOrden, setSelectedOrden] = useState<OrdenPautado | null>(null);

  const isEditing = !!opportunity;

  const [newInvoiceRow, setNewInvoiceRow] = useState<{number: string, date: string, amount: string | number}>({ number: '', date: new Date().toISOString().split('T')[0], amount: '' });
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);

  const [editedOpportunity, setEditedOpportunity] = useState<Partial<Opportunity>>(() =>
    isEditing ? opportunity : getInitialOpportunityData(client)
  );

  const manualUpdateHistory = useMemo(() => {
    if (!opportunity?.manualUpdateHistory || opportunity.manualUpdateHistory.length === 0) {
      return [] as string[];
    }

    return [...opportunity.manualUpdateHistory]
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      .sort((a, b) => {
        const dateA = safeParseManualDate(a);
        const dateB = safeParseManualDate(b);
        if (dateA && dateB) return dateB.getTime() - dateA.getTime();
        if (dateA) return -1;
        if (dateB) return 1;
        return 0;
      });
  }, [opportunity]);

  const isClientOwner = client?.ownerId && userInfo ? client.ownerId === userInfo.id : true;
  const canEditManualUpdateDate = isBoss || !client?.ownerId || isClientOwner;

  function safeParseManualDate(value: string) {
    try {
      const parsed = parseISO(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch (error) {
      return null;
    }
  }

  function formatDateForHistory(date: Date | null, fallback: string) {
    if (date) {
      return format(date, 'PPP', { locale: es });
    }
    return fallback;
  }

  const selectedManualDate = editedOpportunity.manualUpdateDate ? safeParseManualDate(editedOpportunity.manualUpdateDate) : null;
  
  const fetchInvoices = useCallback(async () => {
    if (opportunity) {
        const fetchedInvoices = await getInvoicesForOpportunity(opportunity.id);
        setInvoices(fetchedInvoices);
    }
  }, [opportunity]);


  useEffect(() => {
    if (isOpen) {
        const initialData = isEditing ? { ...opportunity } : getInitialOpportunityData(client);
        if (!initialData.ordenesPautado) initialData.ordenesPautado = [];
        if (!initialData.proposalItems) initialData.proposalItems = [];
        if (!initialData.createdAt && isEditing) initialData.createdAt = opportunity?.createdAt;
        setEditedOpportunity(initialData);
        
        getAgencies()
            .then(setAgencies)
            .catch(() => toast({ title: "Error al cargar agencias", variant: "destructive" }));

        if (isEditing) {
            fetchInvoices();
        } else {
            setInvoices([]);
        }
    }
  }, [opportunity, isOpen, client, toast, fetchInvoices, isEditing]);
  
  const handleAgencyCreated = (newAgency: Agency) => {
    setAgencies(prev => [...prev, newAgency].sort((a,b) => a.name.localeCompare(b.name)));
    setEditedOpportunity(prev => ({...prev, agencyId: newAgency.id }));
  }


 const handleSave = async () => {
    if (isEditing && opportunity) {
        const changes: Partial<Opportunity> = Object.keys(editedOpportunity).reduce((acc, key) => {
            const oppKey = key as keyof Opportunity;
            if (JSON.stringify(editedOpportunity[oppKey]) !== JSON.stringify(opportunity[oppKey])) {
                // @ts-ignore
                acc[oppKey] = editedOpportunity[oppKey];
            }
            return acc;
        }, {} as Partial<Opportunity>);

        if (Object.keys(changes).length > 0) {
            onUpdate(changes);
        }
    } else if (!isEditing) {
        const newOpp = { ...editedOpportunity } as Omit<Opportunity, 'id'>;
        onCreate(newOpp, []);
    }
    onOpenChange(false);
};

  const handleBonusDecision = (decision: 'Autorizado' | 'Rechazado') => {
    if (!userInfo) return;
    setEditedOpportunity(prev => ({
      ...prev,
      bonificacionEstado: decision,
      bonificacionAutorizadoPorId: userInfo.id,
      bonificacionAutorizadoPorNombre: userInfo.name,
      bonificacionFechaAutorizacion: new Date().toISOString(),
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
     if (type === 'number') {
      const sanitizedValue = value.replace(/,/g, '.');
      setEditedOpportunity(prev => ({ ...prev, [name]: sanitizedValue === '' ? '' : Number(sanitizedValue) }));
    } else {
      setEditedOpportunity(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCheckboxChange = (name: keyof Opportunity, checked: boolean | "indeterminate") => {
    setEditedOpportunity(prev => {
        let newState = {...prev};
        
        if (name === 'finalizationDate') {
            if (checked) {
                newState.finalizationDate = newState.finalizationDate || new Date().toISOString().split('T')[0];
            } else {
                delete newState.finalizationDate;
            }
        } else {
            newState = {...newState, [name]: !!checked };
        }
        
        if (name === 'facturaPorAgencia' && !checked) {
            delete newState.agencyId;
        }

        return newState;
    });
}

  const handleMultiCheckboxChange = (field: 'periodicidad' | 'formaDePago', value: string, isChecked: boolean) => {
    setEditedOpportunity(prev => {
        const currentValues = (prev[field] as string[] | undefined) || [];
        const newValues = isChecked
            ? [...currentValues, value]
            : currentValues.filter(item => item !== value);
        return { ...prev, [field]: newValues };
    });
  };
  
  const handleSelectChange = (name: keyof Opportunity, value: string) => {
    setEditedOpportunity(prev => ({...prev, [name]: value }));
  }

  const handleDateChange = (name: keyof Opportunity, date: Date | undefined) => {
    setEditedOpportunity(prev => ({ ...prev, [name]: date ? date.toISOString().split('T')[0] : undefined }));
  };

  const handleSaveOrdenPautado = (orden: OrdenPautado) => {
    setEditedOpportunity(prev => {
      const ordenes = prev.ordenesPautado || [];
      const existingIndex = ordenes.findIndex(o => o.id === orden.id);
      let newOrdenes;
      if (existingIndex > -1) {
        newOrdenes = [...ordenes];
        newOrdenes[existingIndex] = orden;
      } else {
        newOrdenes = [...ordenes, orden];
      }
      return { ...prev, ordenesPautado: newOrdenes };
    });
  };

  const handleEditOrdenPautado = (orden: OrdenPautado) => {
    setSelectedOrden(orden);
    setIsOrdenPautadoFormOpen(true);
  };

  const handleDeleteOrdenPautado = (ordenId: string) => {
    setEditedOpportunity(prev => ({
      ...prev,
      ordenesPautado: (prev.ordenesPautado || []).filter(o => o.id !== ordenId),
    }));
  };

  const handleSaveNewInvoice = async () => {
    if (!opportunity || !userInfo) return;
    const sanitizedNumber = sanitizeInvoiceNumber(newInvoiceRow.number);

    if (!sanitizedNumber || !newInvoiceRow.amount || Number(newInvoiceRow.amount) <= 0) {
      toast({ title: 'Datos de factura incompletos', description: 'Número de factura y monto son requeridos.', variant: 'destructive'});
      return;
    }

    const existingNumbers = new Set(invoices.map(inv => getNormalizedInvoiceNumber(inv)));
    if (existingNumbers.has(sanitizedNumber)) {
      toast({ title: `Factura duplicada #${newInvoiceRow.number}`, description: 'Ya existe una factura con ese número.', variant: 'destructive' });
      return;
    }

    setIsSavingInvoice(true);
    try {
        const newInvoice: Omit<Invoice, 'id'> = {
            opportunityId: opportunity.id,
            invoiceNumber: sanitizedNumber,
            amount: Number(newInvoiceRow.amount),
            date: newInvoiceRow.date,
            status: 'Generada',
            dateGenerated: new Date().toISOString(),
        };

        await createInvoice(newInvoice, userInfo.id, userInfo.name, opportunity.clientName);

        toast({ title: "Factura Guardada" });
        fetchInvoices();
        setNewInvoiceRow({ number: '', date: new Date().toISOString().split('T')[0], amount: '' });

    } catch (error) {
        console.error("Error creating invoice", error);
        toast({ title: "Error al guardar la factura", variant: "destructive" });
    } finally {
        setIsSavingInvoice(false);
    }
  };
  
  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!opportunity || !userInfo) return;
    try {
      await deleteInvoice(invoiceId, userInfo.id, userInfo.name, opportunity.clientName);
      toast({ title: 'Factura eliminada'});
      fetchInvoices();
    } catch (error) {
      console.error("Error deleting invoice", error);
      toast({ title: 'Error al eliminar la factura', variant: 'destructive'});
    }
  }

  
  const canEditBonus = isEditing && (editedOpportunity.stage === 'Negociación' || editedOpportunity.stage === 'Cerrado - Ganado' || editedOpportunity.stage === 'Negociación a Aprobar');
  const hasBonusRequest = !!editedOpportunity.bonificacionDetalle?.trim();
  const canEditCreationDate = isBoss;

  const getBonusStatusPill = (status?: BonificacionEstado) => {
      if (!status) return null;
      const baseClasses = 'px-2 py-1 text-xs font-medium rounded-full';
      const statusMap = {
          'Pendiente': 'bg-yellow-100 text-yellow-800',
          'Autorizado': 'bg-green-100 text-green-800',
          'Rechazado': 'bg-red-100 text-red-800',
      };
      return <span className={cn(baseClasses, statusMap[status])}>{status}</span>;
  }

  const isInvoiceDateInvalid = editedOpportunity.finalizationDate && newInvoiceRow.date > editedOpportunity.finalizationDate;
  
  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle>Oportunidad para: {isEditing ? opportunity?.clientName : client?.name}</DialogTitle>
              <DialogDescription>
                {isEditing ? 'Edita los detalles de la oportunidad.' : 'Rellena los datos para crear una nueva oportunidad.'}
              </DialogDescription>
            </div>
            {isEditing && opportunity && userInfo && (
              <Button variant="ghost" size="icon" onClick={() => setIsTaskFormOpen(true)}>
                <Clock className="h-5 w-5" />
                <span className="sr-only">Crear Tarea/Recordatorio</span>
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-4 -mr-4">
        <Tabs defaultValue="details">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details">Detalles</TabsTrigger>
            <TabsTrigger value="conditions">Cond. Comerciales</TabsTrigger>
            <TabsTrigger value="bonus">Bonificación</TabsTrigger>
            <TabsTrigger value="pautado">Pautado</TabsTrigger>
            <TabsTrigger value="invoicing">Facturación</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="createdAt">Fecha de Creación</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !editedOpportunity.createdAt && "text-muted-foreground")} disabled={!canEditCreationDate}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editedOpportunity.createdAt ? format(parseISO(editedOpportunity.createdAt), "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                    </Button>
                    </PopoverTrigger>
                    {canEditCreationDate && (
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editedOpportunity.createdAt ? parseISO(editedOpportunity.createdAt) : undefined} onSelect={(d) => handleDateChange('createdAt', d)} initialFocus /></PopoverContent>
                    )}
                </Popover>
            </div>
            <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input id="title" name="title" value={editedOpportunity.title || ''} onChange={handleChange}/>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="stage">Etapa</Label>
                    <Select onValueChange={(v: OpportunityStage) => handleSelectChange('stage', v)} value={editedOpportunity.stage}>
                        <SelectTrigger id="stage"><SelectValue/></SelectTrigger>
                        <SelectContent>{opportunityStages.map(stage => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="value">Valor Final Propuesta</Label>
                    <Input id="value" name="value" type="number" value={editedOpportunity.value || ''} onChange={handleChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="details">Descripción</Label>
                <Textarea id="details" name="details" value={editedOpportunity.details || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea id="observaciones" name="observaciones" value={editedOpportunity.observaciones || ''} onChange={handleChange} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Fecha de actualización del asesor</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    'w-full justify-start text-left font-normal',
                                    !editedOpportunity.manualUpdateDate && 'text-muted-foreground'
                                )}
                                disabled={!canEditManualUpdateDate}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {selectedManualDate
                                    ? format(selectedManualDate, 'PPP', { locale: es })
                                    : <span>Seleccionar fecha</span>
                                }
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={selectedManualDate ?? undefined}
                                onSelect={(date) => handleDateChange('manualUpdateDate', date || undefined)}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => handleDateChange('manualUpdateDate', new Date())}
                        disabled={!canEditManualUpdateDate}
                    >
                        Registrar hoy
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        {canEditManualUpdateDate
                            ? 'Esta fecha se guardará en el historial cada vez que registres una actualización manual.'
                            : 'Solo el asesor asignado o un perfil de gestión puede modificar esta fecha.'}
                    </p>
                </div>
                <div className="space-y-2">
                    <Label>Historial de actualizaciones</Label>
                    <div className="min-h-[90px] border rounded-md bg-muted/40 p-3 text-sm space-y-1">
                        {manualUpdateHistory.length > 0 ? (
                            manualUpdateHistory.map((dateValue, index) => {
                                const parsed = safeParseManualDate(dateValue);
                                return (
                                    <p key={`${dateValue}-${index}`} className="flex items-center justify-between">
                                        <span>{formatDateForHistory(parsed, dateValue)}</span>
                                    </p>
                                );
                            })
                        ) : (
                            <p className="text-xs text-muted-foreground">Aún no registraste actualizaciones manuales.</p>
                        )}
                    </div>
                </div>
            </div>
          </TabsContent>

          <TabsContent value="conditions" className="space-y-4 py-4">
              <div className="space-y-2">
                  <Label htmlFor="periodicidad">Periodicidad</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {periodicidadOptions.map(option => (
                          <div key={option} className="flex items-center space-x-2">
                              <Checkbox
                                  id={`period-${option}`}
                                  name='periodicidad'
                                  checked={editedOpportunity.periodicidad?.includes(option)}
                                  onCheckedChange={(checked) => handleMultiCheckboxChange('periodicidad', option, !!checked)}
                              />
                              <Label htmlFor={`period-${option}`} className="font-normal">{option}</Label>
                          </div>
                      ))}
                  </div>
              </div>
              <div className="space-y-2">
                <Label>Forma de Pago</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {formaDePagoOptions.map(option => (
                        <div key={option} className="flex items-center space-x-2">
                            <Checkbox
                                id={`payment-${option}`}
                                name='formaDePago'
                                checked={editedOpportunity.formaDePago?.includes(option)}
                                onCheckedChange={(checked) => handleMultiCheckboxChange('formaDePago', option, !!checked)}
                            />
                            <Label htmlFor={`payment-${option}`} className="font-normal">{option}</Label>
                        </div>
                    ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="fechaFacturacion">Día de Facturación (Día/Mes)</Label>
                    <Input 
                      id="fechaFacturacion" 
                      name="fechaFacturacion"
                      placeholder="DD/MM"
                      value={editedOpportunity.fechaFacturacion || ''}
                      onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9/]/g, '');
                          setEditedOpportunity(prev => ({...prev, fechaFacturacion: val}));
                      }}
                    />
                </div>
              </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div className="flex items-center space-x-2 pt-6">
                    <Checkbox id="facturaPorAgencia" name="facturaPorAgencia" checked={editedOpportunity.facturaPorAgencia} onCheckedChange={(c) => handleCheckboxChange('facturaPorAgencia', c)} />
                    <Label htmlFor="facturaPorAgencia">Factura por Agencia</Label>
                </div>
                {editedOpportunity.facturaPorAgencia && (
                    <div className="space-y-2">
                        <Label htmlFor="agencyId">Agencia</Label>
                        <Select value={editedOpportunity.agencyId || ''} onValueChange={(v) => handleSelectChange('agencyId', v)}>
                            <SelectTrigger id="agencyId"><SelectValue placeholder="Seleccionar agencia..." /></SelectTrigger>
                            <SelectContent>
                                {agencies.map(agency => (
                                    <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>
                                ))}
                                <NewAgencyDialog onAgencyCreated={handleAgencyCreated} />
                            </SelectContent>
                        </Select>
                    </div>
                )}
              </div>
          </TabsContent>
          
          <TabsContent value="bonus" className="space-y-4 py-4">
              <div className="space-y-2">
                  <Label htmlFor="bonificacionDetalle">Detalle Bonificación</Label>
                  <Textarea id="bonificacionDetalle" name="bonificacionDetalle" value={editedOpportunity.bonificacionDetalle || ''} onChange={handleChange} disabled={!canEditBonus} placeholder="Ej: 10% Descuento por pago anticipado..."/>
              </div>

              {hasBonusRequest && (
                    <div className="grid grid-cols-1 gap-3 p-3 mt-2 border rounded-lg bg-muted/50 col-span-full">
                        <h4 className="font-semibold text-sm">Gestión de Bonificación</h4>
                        <div className="flex items-center justify-between">
                            <Label>Estado</Label>
                            {getBonusStatusPill(editedOpportunity.bonificacionEstado)}
                        </div>
                        
                         <div className="space-y-2">
                            <Label htmlFor="bonificacionObservaciones">Observaciones de la Decisión</Label>
                            <Textarea
                                id="bonificacionObservaciones"
                                name="bonificacionObservaciones"
                                value={editedOpportunity.bonificacionObservaciones || ''}
                                onChange={handleChange}
                                disabled={!isBoss}
                                placeholder={!isBoss ? (editedOpportunity.bonificacionObservaciones || 'Sin observaciones') : 'Añadir observaciones...'}
                            />
                        </div>


                        {editedOpportunity.bonificacionEstado === 'Pendiente' && isBoss && (
                             <div className="flex gap-2 mt-2">
                                <Button size="sm" variant="destructive" onClick={() => handleBonusDecision('Rechazado')}>
                                    Rechazar
                                </Button>
                                <Button size="sm" onClick={() => handleBonusDecision('Autorizado')}>
                                    Autorizar
                                </Button>
                            </div>
                        )}

                        {(editedOpportunity.bonificacionEstado === 'Autorizado' || editedOpportunity.bonificacionEstado === 'Rechazado') && (
                            <div className="text-xs text-muted-foreground space-y-1 mt-1">
                                <p>Decisión por: {editedOpportunity.bonificacionAutorizadoPorNombre}</p>
                                <p>Fecha: {editedOpportunity.bonificacionFechaAutorizacion ? format(new Date(editedOpportunity.bonificacionFechaAutorizacion), "PPP p", { locale: es }) : '-'}</p>
                            </div>
                        )}
                    </div>
                )}
          </TabsContent>
          
          <TabsContent value="pautado" className="py-4">
             <div className="flex justify-end mb-4">
                <Button onClick={() => { setSelectedOrden(null); setIsOrdenPautadoFormOpen(true); }}>
                  <PlusCircle className="mr-2 h-4 w-4"/>
                  Añadir Orden de Pauta
                </Button>
            </div>
            <div className="space-y-3">
              {(editedOpportunity.ordenesPautado || []).map(orden => (
                  <div key={orden.id} className="p-3 border rounded-md">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{orden.tipoPauta}</p>
                        <div className="flex items-center gap-2">
                           <Button variant="ghost" size="sm" onClick={() => handleEditOrdenPautado(orden)}>Editar</Button>
                           <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteOrdenPautado(orden.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground mt-2 space-y-1">
                        <p><strong>Programas:</strong> {orden.programas?.join(', ')}</p>
                        <p><strong>Vigencia:</strong> {orden.fechaInicio ? format(new Date(orden.fechaInicio), 'P', {locale: es}) : ''} - {orden.fechaFin ? format(new Date(orden.fechaFin), 'P', {locale: es}) : ''}</p>
                        <p><strong>Repeticiones:</strong> {orden.repeticiones} por día</p>
                        {orden.tipoPauta === 'Spot' && <p><strong>Segundos:</strong> {orden.segundos}</p>}
                        {orden.textoPNT && <p className="mt-2 pt-2 border-t"><strong>Texto PNT:</strong> {orden.textoPNT}</p>}
                      </div>
                  </div>
              ))}
               {(editedOpportunity.ordenesPautado || []).length === 0 && (
                <p className="text-center text-muted-foreground py-8">No hay órdenes de pautado cargadas.</p>
               )}
            </div>
          </TabsContent>
          
          <TabsContent value="invoicing" className="py-4 space-y-6">
            {isEditing && editedOpportunity.stage === 'Cerrado - Ganado' && (
                <div className="space-y-4 p-4 border rounded-md bg-muted/30">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="finalize-opp"
                            checked={!!editedOpportunity.finalizationDate} 
                            onCheckedChange={(checked) => handleCheckboxChange('finalizationDate', checked)}
                        />
                        <Label htmlFor="finalize-opp">Finalizar propuesta anticipadamente</Label>
                    </div>
                    {editedOpportunity.finalizationDate !== undefined && (
                        <div className="space-y-2">
                            <Label htmlFor="finalizationDate">Fecha de Finalización</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !editedOpportunity.finalizationDate && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {editedOpportunity.finalizationDate ? format(parseISO(editedOpportunity.finalizationDate), "PPP", { locale: es }) : <span>Seleccionar fecha de fin</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editedOpportunity.finalizationDate ? parseISO(editedOpportunity.finalizationDate) : undefined} onSelect={(d) => handleDateChange('finalizationDate', d)} initialFocus /></PopoverContent>
                            </Popover>
                             <p className="text-xs text-muted-foreground">
                                Esta oportunidad se considerará finalizada en esta fecha, independientemente de su periodicidad.
                            </p>
                        </div>
                    )}
                </div>
            )}
            <fieldset disabled={!isEditing} className="space-y-4">
                {!isEditing && (
                    <div className="text-center text-sm text-muted-foreground p-4 border rounded-md bg-muted/50">
                        Guarda primero la oportunidad para poder cargar facturas.
                    </div>
                )}
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nº Factura</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Estado</TableHead>
                            {isEditing && <TableHead className="w-12"></TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.map(invoice => {
                            const amountValue = Number(invoice.amount ?? 0);
                            const safeAmount = Number.isFinite(amountValue) ? amountValue : 0;
                            return (
                            <TableRow key={invoice.id}>
                                <TableCell>{invoice.invoiceNumber}</TableCell>
                                <TableCell>{invoice.date ? format(parseISO(invoice.date), 'P', { locale: es }) : '-'}</TableCell>
                                <TableCell>${safeAmount.toLocaleString('es-AR')}</TableCell>
                                <TableCell>{invoice.status}</TableCell>
                                {isEditing &&
                                  <TableCell>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteInvoice(invoice.id)}>
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                  </TableCell>
                                }
                            </TableRow>
                        )})}
                        {invoices.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={isEditing ? 5 : 4} className="h-24 text-center">No hay facturas para esta oportunidad.</TableCell>
                            </TableRow>
                        )}
                        {/* New Invoice Row */}
                         <TableRow>
                              <TableCell>
                                  <Input
                                      placeholder="0001-00123456"
                                      value={newInvoiceRow.number}
                                      onChange={(e) => setNewInvoiceRow(prev => ({...prev, number: sanitizeInvoiceNumber(e.target.value)}))}
                                  />
                              </TableCell>
                             <TableCell>
                                <Input 
                                    type="date" 
                                    value={newInvoiceRow.date}
                                    onChange={(e) => setNewInvoiceRow(prev => ({...prev, date: e.target.value}))}
                                />
                            </TableCell>
                             <TableCell>
                                <Input 
                                    type="number"
                                    placeholder="0.00"
                                    value={newInvoiceRow.amount}
                                    onChange={(e) => setNewInvoiceRow(prev => ({...prev, amount: e.target.value}))}
                                />
                            </TableCell>
                             <TableCell colSpan={isEditing ? 2 : 1}>
                                <Button onClick={handleSaveNewInvoice} size="sm" disabled={isSavingInvoice || isInvoiceDateInvalid}>
                                    {isSavingInvoice ? <Spinner size="small" /> : <Save className="mr-2 h-4 w-4"/>}
                                    Guardar Factura
                                </Button>
                             </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                 {isInvoiceDateInvalid && (
                    <p className="text-xs text-destructive mt-1">La fecha de la factura no puede ser posterior a la fecha de finalización de la propuesta.</p>
                )}
            </fieldset>
          </TabsContent>

        </Tabs>

        {opportunity && userInfo && client?.ownerId && (
          <CommentThread
            entityType="opportunity"
            entityId={opportunity.id}
            entityName={opportunity.title}
            ownerId={client.ownerId}
            ownerName={client.ownerName || client.name}
            currentUser={userInfo}
            getAccessToken={getGoogleAccessToken}
          />
        )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
     {isTaskFormOpen && opportunity && userInfo && (
        <TaskFormDialog
            isOpen={isTaskFormOpen}
            onOpenChange={setIsTaskFormOpen}
            opportunity={opportunity}
            client={client || { id: opportunity.clientId, name: opportunity.clientName }}
            userInfo={userInfo}
            getGoogleAccessToken={getGoogleAccessToken}
        />
     )}
     {isOrdenPautadoFormOpen && (
        <OrdenPautadoFormDialog
            isOpen={isOrdenPautadoFormOpen}
            onOpenChange={setIsOrdenPautadoFormOpen}
            onSave={handleSaveOrdenPautado}
            orden={selectedOrden}
        />
     )}
     </>
  );
}
