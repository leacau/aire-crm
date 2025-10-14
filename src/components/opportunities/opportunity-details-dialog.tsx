'use client';

import React, { useState, useEffect } from 'react';
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
import type { Opportunity, OpportunityStage, BonificacionEstado, Agency, Periodicidad, FormaDePago, ProposalFile, Invoice, Pautado } from '@/lib/types';
import { periodicidadOptions, formaDePagoOptions } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth.tsx';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAgencies, createAgency, getInvoicesForOpportunity, createInvoice, updateInvoice, deleteInvoice } from '@/lib/firebase-service';
import { PlusCircle, Clock, Trash2 } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { LinkifiedText } from '@/components/ui/linkified-text';
import { TaskFormDialog } from './task-form-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { invoiceStatusOptions } from '@/lib/types';

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

interface OpportunityDetailsDialogProps {
  opportunity: Opportunity | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUpdate: (opportunity: Partial<Opportunity>) => void;
  onCreate?: (opportunity: Omit<Opportunity, 'id'>) => void;
  client?: {id: string, name: string}
}

const getInitialOpportunityData = (client: any): Omit<Opportunity, 'id'> => ({
    title: '',
    details: '',
    value: 0,
    stage: 'Nuevo',
    observaciones: '',
    closeDate: new Date().toISOString().split('T')[0],
    clientName: client?.name || '',
    clientId: client?.id || '',
    bonificacionDetalle: '',
    periodicidad: [],
    facturaPorAgencia: false,
    formaDePago: [],
    fechaFacturacion: '',
    pautados: [],
    proposalFiles: [],
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
  
  const getInitialData = () => {
      if (opportunity) {
        const data = { ...opportunity };
        if (!data.pautados && (data.fechaInicioPauta || data.fechaFinPauta)) {
          data.pautados = [{
            id: 'legacy-pautado-0',
            fechaInicio: data.fechaInicioPauta || '',
            fechaFin: data.fechaFinPauta || ''
          }];
        } else if (!data.pautados) {
            data.pautados = [];
        }
        return data;
      }
      return getInitialOpportunityData(client);
  }

  const [editedOpportunity, setEditedOpportunity] = useState<Partial<Opportunity>>(getInitialData());

  const fetchInvoices = async () => {
    if (opportunity) {
        const fetchedInvoices = await getInvoicesForOpportunity(opportunity.id);
        setInvoices(fetchedInvoices);
    }
  };

  useEffect(() => {
    if (isOpen) {
        const initialData = getInitialData();
        setEditedOpportunity(initialData);
        
        getAgencies().then(setAgencies).catch(() => {
            toast({ title: "Error al cargar agencias", variant: "destructive" });
        });

        if (opportunity) {
            getInvoicesForOpportunity(opportunity.id).then(fetchedInvoices => {
                 // Handle legacy invoice data
                const legacyInvoices: Invoice[] = [];
                if (initialData.facturaNo || initialData.valorCerrado) {
                    const legacyInvoice: Invoice = {
                        id: 'legacy-0', // Dummy ID
                        opportunityId: opportunity.id,
                        invoiceNumber: initialData.facturaNo || 'N/A',
                        amount: initialData.valorCerrado || 0,
                        status: initialData.pagado ? 'Pagada' : 'Generada',
                        dateGenerated: new Date().toISOString(),
                    };
                    legacyInvoices.push(legacyInvoice);
                }
                setInvoices([...legacyInvoices, ...fetchedInvoices]);
            });
        } else {
          setInvoices([]);
        }
    }
  }, [opportunity, isOpen, client, toast]);
  
  const handleAgencyCreated = (newAgency: Agency) => {
    setAgencies(prev => [...prev, newAgency].sort((a,b) => a.name.localeCompare(b.name)));
    setEditedOpportunity(prev => ({...prev, agencyId: newAgency.id }));
  }


  const isEditing = opportunity !== null;

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

        if (JSON.stringify(editedOpportunity.proposalFiles) !== JSON.stringify(opportunity.proposalFiles)) {
          changes.proposalFiles = editedOpportunity.proposalFiles;
        }

        if (Object.keys(changes).length > 0) {
            onUpdate(changes);
        }
    } else if (!isEditing) {
        const newOpp = {
            ...editedOpportunity,
            value: editedOpportunity.value || 0, // Ensure value is a number
        } as Omit<Opportunity, 'id'>;
        onCreate(newOpp);
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
    const { name, value } = e.target;
    let finalValue: string | number | undefined = value;

    if (name === 'value' || name === 'valorCerrado') {
        finalValue = value === '' ? 0 : Number(value);
    }
    
    if (name === 'fechaFacturacion' && value) {
        const [year, month, day] = value.split('-');
        finalValue = `${day}/${month}`;
    }

    setEditedOpportunity(prev => {
        const newState: Partial<Opportunity> = { ...prev, [name]: finalValue };
        
        if (name === 'bonificacionDetalle') {
            if (value.trim()) {
                if (prev.bonificacionEstado !== 'Autorizado' && prev.bonificacionEstado !== 'Rechazado') {
                    newState.bonificacionEstado = 'Pendiente';
                }
                 // Auto-move to "Negociación a Aprobar"
                if (prev.stage === 'Negociación') {
                    newState.stage = 'Negociación a Aprobar';
                }
            } else {
                delete newState.bonificacionEstado;
                delete newState.bonificacionAutorizadoPorId;
                delete newState.bonificacionAutorizadoPorNombre;
                delete newState.bonificacionFechaAutorizacion;
            }
        }

        return newState;
    });
  };

  const handleCheckboxChange = (name: keyof Opportunity, checked: boolean | "indeterminate") => {
    setEditedOpportunity(prev => {
        const newState = {...prev, [name]: !!checked };
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

  const handleAddInvoice = async () => {
    if (!opportunity || !userInfo) return;
    const newInvoice = {
      opportunityId: opportunity.id,
      invoiceNumber: '',
      amount: 0,
      status: 'Generada' as const,
      dateGenerated: new Date().toISOString(),
    };
    try {
      const newInvoiceId = await createInvoice(newInvoice, userInfo.id, userInfo.name, opportunity.clientName);
      setInvoices(prev => [...prev, { id: newInvoiceId, ...newInvoice }]);
      toast({ title: "Factura añadida" });
    } catch (e) {
      toast({ title: "Error al añadir factura", variant: "destructive" });
    }
  };

  const handleInvoiceChange = (invoiceId: string, field: keyof Invoice, value: any) => {
    setInvoices(prevInvoices => 
        prevInvoices.map(inv => (inv.id === invoiceId ? { ...inv, [field]: value } : inv))
    );
  };
  
  const handleInvoiceUpdate = (invoiceId: string) => {
    if (!userInfo || !opportunity) return;
    const invoiceToUpdate = invoices.find(inv => inv.id === invoiceId);
    if (invoiceToUpdate && invoiceToUpdate.id.startsWith('legacy')) {
        toast({title: "Factura Antigua", description: "Las facturas antiguas no se pueden modificar desde aquí."});
        return;
    }
    if (invoiceToUpdate) {
        updateInvoice(invoiceId, invoiceToUpdate, userInfo.id, userInfo.name, opportunity.clientName)
            .then(() => {
                toast({ title: "Factura actualizada" });
            })
            .catch((e) => {
                console.error("Failed to update invoice:", e);
                toast({ title: "Error al actualizar factura", variant: "destructive" });
                fetchInvoices(); 
            });
    }
  }

  const handleInvoiceDelete = async (invoiceId: string) => {
    if (!userInfo || !opportunity) return;
    if (invoiceId.startsWith('legacy')) {
        toast({title: "Factura Antigua", description: "Las facturas antiguas no se pueden eliminar."});
        return;
    }
    try {
        await deleteInvoice(invoiceId, userInfo.id, userInfo.name, opportunity.clientName);
        setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
        toast({ title: "Factura eliminada" });
    } catch(e) {
        toast({ title: "Error al eliminar factura", variant: "destructive" });
    }
  }

  const handleAddPautado = () => {
    const newPautado = {
        id: `pautado-${Date.now()}`, // Simple unique ID for client-side state
        fechaInicio: '',
        fechaFin: '',
    };
    setEditedOpportunity(prev => ({
        ...prev,
        pautados: [...(prev.pautados || []), newPautado]
    }));
  };

  const handlePautadoChange = (id: string, field: 'fechaInicio' | 'fechaFin', value: string) => {
    setEditedOpportunity(prev => ({
        ...prev,
        pautados: (prev.pautados || []).map(p => 
            p.id === id ? { ...p, [field]: value } : p
        )
    }));
  };

  const handleRemovePautado = (id: string) => {
    setEditedOpportunity(prev => ({
        ...prev,
        pautados: (prev.pautados || []).filter(p => p.id !== id)
    }));
  };

  const isCloseWon = editedOpportunity.stage === 'Cerrado - Ganado';
  const canEditBonus = editedOpportunity.stage === 'Negociación' || editedOpportunity.stage === 'Cerrado - Ganado' || editedOpportunity.stage === 'Negociación a Aprobar';
  const hasBonusRequest = !!editedOpportunity.bonificacionDetalle?.trim();

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
  
  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle>{isEditing ? 'Detalles de la Oportunidad' : 'Nueva Oportunidad'}</DialogTitle>
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
            <TabsTrigger value="billing">Facturación</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details" className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input id="title" name="title" value={editedOpportunity.title || ''} onChange={handleChange}/>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="value">Valor</Label>
                    <Input id="value" name="value" type="number" value={editedOpportunity.value || ''} onChange={handleChange}/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="stage">Etapa</Label>
                    <Select onValueChange={(v: OpportunityStage) => handleSelectChange('stage', v)} value={editedOpportunity.stage}>
                        <SelectTrigger id="stage"><SelectValue/></SelectTrigger>
                        <SelectContent>{opportunityStages.map(stage => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}</SelectContent>
                    </Select>
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
                    <Label htmlFor="fechaFacturacion">Fecha de Facturación (Día/Mes)</Label>
                    <Input 
                      id="fechaFacturacion" 
                      name="fechaFacturacion"
                      type="date"
                      value={editedOpportunity.fechaFacturacion ? `2000-${editedOpportunity.fechaFacturacion.split('/')[1]}-${editedOpportunity.fechaFacturacion.split('/')[0]}` : ''}
                      onChange={handleChange}
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
                  <Textarea id="bonificacionDetalle" name="bonificacionDetalle" value={editedOpportunity.bonificacionDetalle || ''} onChange={handleChange} disabled={!canEditBonus} placeholder={!canEditBonus ? 'Solo en Negociación o Cierre Ganado' : 'Ej: 10% Descuento'}/>
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

          <TabsContent value="pautado" className="space-y-4 py-4">
                <div className="flex justify-between items-center">
                    <h4 className="font-medium">Períodos de Pautado</h4>
                    <Button size="sm" onClick={handleAddPautado}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Añadir Pauta
                    </Button>
                </div>
                <div className="space-y-2">
                    {(editedOpportunity.pautados || []).map((pautado) => (
                        <div key={pautado.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center p-2 border rounded-md">
                             <div className="space-y-1">
                                <Label htmlFor={`pautado-inicio-${pautado.id}`}>Inicio de Pauta</Label>
                                <Input 
                                  id={`pautado-inicio-${pautado.id}`}
                                  type="date"
                                  value={pautado.fechaInicio || ''}
                                  onChange={(e) => handlePautadoChange(pautado.id, 'fechaInicio', e.target.value)}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`pautado-fin-${pautado.id}`}>Fin de Pauta</Label>
                                <Input 
                                  id={`pautado-fin-${pautado.id}`}
                                  type="date"
                                  value={pautado.fechaFin || ''}
                                  onChange={(e) => handlePautadoChange(pautado.id, 'fechaFin', e.target.value)}
                                />
                            </div>
                             <Button variant="ghost" size="icon" onClick={() => handleRemovePautado(pautado.id)} className="self-end">
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    ))}
                    {(editedOpportunity.pautados?.length || 0) === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-4">No hay períodos de pautado definidos.</p>
                    )}
                </div>
                <div className="p-4 bg-blue-50 border-l-4 border-blue-400 text-blue-800 rounded">
                    <p className="text-sm font-medium">Próximamente: Notificaciones automáticas</p>
                    <p className="text-xs">Se enviará una notificación por correo 30 días antes de la finalización de la pauta.</p>
                </div>
          </TabsContent>
          
          <TabsContent value="billing" className="py-4">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Facturas</h4>
                  <Button size="sm" onClick={handleAddInvoice} disabled={!opportunity}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Añadir Factura
                  </Button>
                </div>
                 <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nº Factura</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="w-12"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                            <TableCell>
                                <Input value={invoice.invoiceNumber || ''} onChange={(e) => handleInvoiceChange(invoice.id, 'invoiceNumber', e.target.value)} onBlur={() => handleInvoiceUpdate(invoice.id)}/>
                            </TableCell>
                            <TableCell>
                                <Input type="number" value={invoice.amount || ''} onChange={(e) => handleInvoiceChange(invoice.id, 'amount', Number(e.target.value))} onBlur={() => handleInvoiceUpdate(invoice.id)}/>
                            </TableCell>
                            <TableCell>
                                <Select 
                                    value={invoice.status} 
                                    onValueChange={(value) => {
                                        const updatedInvoices = invoices.map(inv => {
                                            if (inv.id === invoice.id) {
                                                const updatedInv = { ...inv, status: value as Invoice['status'] };
                                                if (value === 'Pagada' && !inv.datePaid) {
                                                    updatedInv.datePaid = new Date().toISOString();
                                                }
                                                return updatedInv;
                                            }
                                            return inv;
                                        });
                                        setInvoices(updatedInvoices);
                                        handleInvoiceUpdate(invoice.id);
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {invoiceStatusOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                             <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => handleInvoiceDelete(invoice.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </TableCell>
                        </TableRow>
                        ))}
                         {invoices.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center h-24">No hay facturas para esta oportunidad.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
              </div>
          </TabsContent>
        </Tabs>
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
     </>
  );
}
