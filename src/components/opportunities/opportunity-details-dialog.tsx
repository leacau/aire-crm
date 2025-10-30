'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import type { Opportunity, OpportunityStage, BonificacionEstado, Agency, Periodicidad, FormaDePago, ProposalFile, Invoice, Pautado, InvoiceStatus, ProposalItem, Program } from '@/lib/types';
import { periodicidadOptions, formaDePagoOptions } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth.tsx';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAgencies, createAgency, getInvoicesForOpportunity, createInvoice, updateInvoice, deleteInvoice, getPrograms } from '@/lib/firebase-service';
import { PlusCircle, Clock, Trash2, FileText, Save, Calculator } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { TaskFormDialog } from './task-form-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { invoiceStatusOptions } from '@/lib/types';
import { OrdenPautadoFormDialog } from './orden-pautado-form-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

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
  onUpdate: (opportunity: Partial<Opportunity>, accessToken?: string | null) => void;
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
  const [programs, setPrograms] = useState<Program[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isOrdenPautadoFormOpen, setIsOrdenPautadoFormOpen] = useState(false);
  const isEditing = !!opportunity;
  
  const getInitialData = () => {
      if (opportunity) {
        const data = { ...opportunity };
        if (!data.pautados) data.pautados = [];
        if (!data.proposalItems) data.proposalItems = [];
        return data;
      }
      return getInitialOpportunityData(client);
  }

  const [editedOpportunity, setEditedOpportunity] = useState<Partial<Opportunity>>(getInitialData());

  const fetchInvoices = useCallback(async () => {
    if (opportunity) {
        const fetchedInvoices = await getInvoicesForOpportunity(opportunity.id);
        setInvoices(fetchedInvoices);
    }
  }, [opportunity]);


  useEffect(() => {
    if (isOpen) {
        const initialData = getInitialData();
        setEditedOpportunity(initialData);
        
        Promise.all([
          getAgencies(),
          getPrograms()
        ]).then(([agencies, programs]) => {
          setAgencies(agencies);
          setPrograms(programs);
        }).catch(() => {
            toast({ title: "Error al cargar datos auxiliares", variant: "destructive" });
        });

        if (opportunity) {
            fetchInvoices();
        } else {
          setInvoices([]);
        }
    }
  }, [opportunity, isOpen, client, toast, fetchInvoices]);
  
  const handleAgencyCreated = (newAgency: Agency) => {
    setAgencies(prev => [...prev, newAgency].sort((a,b) => a.name.localeCompare(b.name)));
    setEditedOpportunity(prev => ({...prev, agencyId: newAgency.id }));
  }


 const handleSave = async () => {
    const oppToSave = { ...editedOpportunity };

    const valorTarifario = (oppToSave.proposalItems || []).reduce((acc, item) => acc + item.subtotal, 0);
    const valorFinal = oppToSave.value || 0;

    oppToSave.valorTarifario = valorTarifario;
    
    if (valorFinal < valorTarifario) {
        const diff = valorTarifario - valorFinal;
        const percentage = valorTarifario > 0 ? (diff / valorTarifario) * 100 : 0;
        oppToSave.bonificacionDetalle = `Descuento: $${diff.toLocaleString('es-AR')} (${percentage.toFixed(2)}%)`;
        if (oppToSave.bonificacionEstado !== 'Autorizado' && oppToSave.bonificacionEstado !== 'Rechazado') {
            oppToSave.bonificacionEstado = 'Pendiente';
        }
        if (oppToSave.stage === 'Negociación') {
            oppToSave.stage = 'Negociación a Aprobar';
        }
    } else {
        oppToSave.bonificacionDetalle = '';
        delete oppToSave.bonificacionEstado;
    }

    if (isEditing && opportunity) {
        const changes: Partial<Opportunity> = Object.keys(oppToSave).reduce((acc, key) => {
            const oppKey = key as keyof Opportunity;
            if (JSON.stringify(oppToSave[oppKey]) !== JSON.stringify(opportunity[oppKey])) {
                // @ts-ignore
                acc[oppKey] = oppToSave[oppKey];
            }
            return acc;
        }, {} as Partial<Opportunity>);

        if (Object.keys(changes).length > 0) {
            const accessToken = await getGoogleAccessToken();
            onUpdate(changes, accessToken);
        }
    } else if (!isEditing) {
        const newOpp = { ...oppToSave } as Omit<Opportunity, 'id'>;
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

    if (name === 'value') {
        finalValue = value === '' ? 0 : Number(value);
    }
    
    setEditedOpportunity(prev => ({ ...prev, [name]: finalValue }));
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
    
    const newInvoiceData: Omit<Invoice, 'id'> = {
        opportunityId: opportunity.id,
        invoiceNumber: '',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        status: 'Generada' as const,
        dateGenerated: new Date().toISOString(),
    };

    try {
        const newInvoiceId = await createInvoice(newInvoiceData, userInfo.id, userInfo.name, opportunity.clientName);
        const newInvoiceWithId: Invoice = { ...newInvoiceData, id: newInvoiceId };
        setInvoices(prev => [...prev, newInvoiceWithId]);
        toast({ title: "Factura añadida" });
    } catch (e) {
        console.error("Error adding invoice", e);
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

    if (invoiceToUpdate) {
        const {id, ...updateData} = invoiceToUpdate;

        updateInvoice(invoiceId, updateData, userInfo.id, userInfo.name, opportunity.clientName)
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
    try {
        await deleteInvoice(invoiceId, userInfo.id, userInfo.name, opportunity.clientName);
        setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
        toast({ title: "Factura eliminada" });
    } catch(e) {
        console.error("Error deleting invoice", e);
        toast({ title: "Error al eliminar factura", variant: "destructive" });
    }
  }

  const handleAddPautado = () => {
    const newPautado = {
        id: `pautado-${Date.now()}`,
        fechaInicio: '',
        fechaFin: '',
    };
    setEditedOpportunity(prev => ({ ...prev, pautados: [...(prev.pautados || []), newPautado] }));
  };

  const handlePautadoChange = (id: string, field: 'fechaInicio' | 'fechaFin', value: string) => {
    setEditedOpportunity(prev => ({ ...prev, pautados: (prev.pautados || []).map(p => p.id === id ? { ...p, [field]: value } : p) }));
  };

  const handleRemovePautado = (id: string) => {
    setEditedOpportunity(prev => ({ ...prev, pautados: (prev.pautados || []).filter(p => p.id !== id) }));
  };

  const handleProposalItemChange = (itemId: string, field: keyof ProposalItem, value: any) => {
      setEditedOpportunity(prev => {
          const newItems = (prev.proposalItems || []).map(item => {
              if (item.id === itemId) {
                  const updatedItem = { ...item, [field]: value };
                  if (['cantidadDia', 'cantidadMes', 'duracionSegundos', 'valorUnitario'].includes(field)) {
                      const { cantidadDia, cantidadMes, duracionSegundos, valorUnitario } = updatedItem;
                      if (['spotRadio', 'spotTv'].includes(updatedItem.type)) {
                          updatedItem.subtotal = (cantidadDia * cantidadMes * (duracionSegundos || 0) * valorUnitario);
                      } else {
                          updatedItem.subtotal = (cantidadDia * cantidadMes * valorUnitario);
                      }
                  }
                  return updatedItem;
              }
              return item;
          });
          return { ...prev, proposalItems: newItems };
      });
  };

    const handleRemoveProposalItem = (itemId: string) => {
        setEditedOpportunity(prev => ({
            ...prev,
            proposalItems: (prev.proposalItems || []).filter(item => item.id !== itemId)
        }));
    };

  const handleAddProposalProgram = (programId: string) => {
    if (!programId) return;
    const program = programs.find(p => p.id === programId);
    if (!program) return;
    // Check if program already added to avoid duplicates
    if ((editedOpportunity.proposalItems || []).some(item => item.programId === programId)) {
        toast({ title: "Programa ya añadido", description: "Ya has añadido este programa. Puedes añadir más ítems dentro de él.", variant: "default"});
        return;
    }

    const newItem: ProposalItem = {
        id: `prop-${Date.now()}`,
        programId: program.id,
        programName: program.name,
        type: 'spotRadio',
        label: 'Spot Radio',
        cantidadDia: 1,
        cantidadMes: 1,
        duracionSegundos: 0,
        valorUnitario: program.rates?.spotRadio || 0,
        subtotal: 0, // Will be recalculated
    };
    // Recalculate subtotal
    const { cantidadDia, cantidadMes, duracionSegundos, valorUnitario } = newItem;
    newItem.subtotal = (cantidadDia * cantidadMes * (duracionSegundos || 0) * valorUnitario);

    setEditedOpportunity(prev => ({
        ...prev,
        proposalItems: [...(prev.proposalItems || []), newItem]
    }));
  };

  const handleRemoveProposalProgramGroup = (programId: string) => {
      setEditedOpportunity(prev => ({
          ...prev,
          proposalItems: (prev.proposalItems || []).filter(item => item.programId !== programId)
      }));
  };

   const handleAddProposalItemToGroup = (programId: string) => {
      const program = programs.find(p => p.id === programId);
      if (!program) return;

      const newItem: ProposalItem = {
          id: `prop-${Date.now()}`,
          programId: program.id,
          programName: program.name,
          type: 'spotRadio',
          label: 'Spot Radio',
          cantidadDia: 1,
          cantidadMes: 1,
          duracionSegundos: 0,
          valorUnitario: program.rates?.spotRadio || 0,
          subtotal: 0,
      };
      const { cantidadDia, cantidadMes, duracionSegundos, valorUnitario } = newItem;
      newItem.subtotal = (cantidadDia * cantidadMes * (duracionSegundos || 0) * valorUnitario);

      setEditedOpportunity(prev => ({
          ...prev,
          proposalItems: [...(prev.proposalItems || []), newItem]
      }));
  };

  const handleProposalTypeChange = (itemId: string, type: ProposalItem['type']) => {
      const program = programs.find(p => p.id === editedOpportunity.proposalItems?.find(i => i.id === itemId)?.programId);
      const rate = program?.rates?.[type] || 0;
      const labels = {
          spotRadio: 'Spot Radio',
          spotTv: 'Spot TV',
          pnt: 'PNT',
          pntMasBarrida: 'PNT + Barrida',
          auspicio: 'Auspicio',
          notaComercial: 'Nota Comercial',
      };
      
      setEditedOpportunity(prev => {
          const newItems = (prev.proposalItems || []).map(item => {
              if (item.id === itemId) {
                  const updatedItem = { ...item, type, valorUnitario: rate, label: labels[type] };
                  const { cantidadDia, cantidadMes, duracionSegundos, valorUnitario } = updatedItem;
                  if (['spotRadio', 'spotTv'].includes(updatedItem.type)) {
                      updatedItem.subtotal = (cantidadDia * cantidadMes * (duracionSegundos || 0) * valorUnitario);
                  } else {
                      updatedItem.subtotal = (cantidadDia * cantidadMes * valorUnitario);
                  }
                  return updatedItem;
              }
              return item;
          });
          return { ...prev, proposalItems: newItems };
      });
  };

  const calculatedValue = (editedOpportunity.proposalItems || []).reduce((acc, item) => acc + item.subtotal, 0);
  
  const proposalItemsByProgram = (editedOpportunity.proposalItems || []).reduce((acc, item) => {
    if (!acc[item.programId]) {
      acc[item.programId] = {
        programName: item.programName,
        items: []
      };
    }
    acc[item.programId].items.push(item);
    return acc;
  }, {} as Record<string, { programName: string, items: ProposalItem[] }>);

  const canEditBonus = isEditing && (editedOpportunity.stage === 'Negociación' || editedOpportunity.stage === 'Cerrado - Ganado' || editedOpportunity.stage === 'Negociación a Aprobar');
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
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle>{isEditing ? `Oportunidad para: ${opportunity?.clientName}` : `Nueva Oportunidad para: ${client?.name}`}</DialogTitle>
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="details">Descripción</Label>
                <Textarea id="details" name="details" value={editedOpportunity.details || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea id="observaciones" name="observaciones" value={editedOpportunity.observaciones || ''} onChange={handleChange} />
            </div>
             <div className="space-y-4 pt-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold">Calculadora de Tarifas</CardTitle>
                        <div className="flex items-center gap-2">
                             <Select onValueChange={handleAddProposalProgram}>
                                <SelectTrigger className="w-[200px] h-9">
                                    <SelectValue placeholder="Añadir Programa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {programs.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {Object.keys(proposalItemsByProgram).length > 0 ? (
                        Object.entries(proposalItemsByProgram).map(([programId, group]) => (
                            <div key={programId} className="p-3 border rounded-lg bg-muted/30">
                                <div className="flex justify-between items-center mb-2">
                                  <h4 className="font-semibold">{group.programName}</h4>
                                  <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleRemoveProposalProgramGroup(programId)}><Trash2 className="h-4 w-4"/></Button>
                                </div>
                                <div className="space-y-2">
                                  {group.items.map(item => (
                                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-2 items-end">
                                      <div className="md:col-span-3 space-y-1">
                                          <Label className="text-xs">Tipo</Label>
                                          <Select value={item.type} onValueChange={v => handleProposalTypeChange(item.id, v as any)}>
                                              <SelectTrigger><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                  <SelectItem value="spotRadio">Spot Radio</SelectItem>
                                                  <SelectItem value="spotTv">Spot TV</SelectItem>
                                                  <SelectItem value="pnt">PNT</SelectItem>
                                                  <SelectItem value="pntMasBarrida">PNT + Barrida</SelectItem>
                                                  <SelectItem value="auspicio">Auspicio</SelectItem>
                                                  <SelectItem value="notaComercial">Nota Comercial</SelectItem>
                                              </SelectContent>
                                          </Select>
                                      </div>
                                      {(item.type === 'spotRadio' || item.type === 'spotTv') && <div className="md:col-span-1 space-y-1"><Label className="text-xs">Seg</Label><Input type="number" value={item.duracionSegundos} onChange={e => handleProposalItemChange(item.id, 'duracionSegundos', Number(e.target.value))} /></div>}
                                      <div className="md:col-span-1 space-y-1"><Label className="text-xs">Cant/Día</Label><Input type="number" value={item.cantidadDia} onChange={e => handleProposalItemChange(item.id, 'cantidadDia', Number(e.target.value))} /></div>
                                      <div className="md:col-span-1 space-y-1"><Label className="text-xs">Días/Mes</Label><Input type="number" value={item.cantidadMes} onChange={e => handleProposalItemChange(item.id, 'cantidadMes', Number(e.target.value))} /></div>
                                      <div className="md:col-span-2 space-y-1"><Label className="text-xs">Valor Unit.</Label><Input type="number" value={item.valorUnitario} disabled className="bg-gray-100"/></div>
                                      <div className="md:col-span-2 space-y-1"><Label className="text-xs">Subtotal</Label><Input value={item.subtotal.toLocaleString('es-AR')} disabled className="font-bold bg-gray-100" /></div>
                                      <div className="md:col-span-1 flex justify-end"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveProposalItem(item.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button></div>
                                    </div>
                                  ))}
                                </div>
                                <Button size="sm" variant="ghost" className="mt-2" onClick={() => handleAddProposalItemToGroup(programId)}><PlusCircle className="mr-2 h-4 w-4"/>Añadir ítem a este programa</Button>
                            </div>
                        ))
                      ) : (
                        <p className="text-center text-sm text-muted-foreground py-4">Añade un programa para comenzar a construir la propuesta.</p>
                      )}
                    </CardContent>
                </Card>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div className="p-3 bg-muted rounded-md text-right">
                        <Label className="font-bold text-base">TOTAL TARIFARIO:</Label>
                        <p className="text-2xl font-bold">${calculatedValue.toLocaleString('es-AR')}</p>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="value" className="text-base font-bold">Valor Final Propuesta</Label>
                        <Input id="value" name="value" type="number" value={editedOpportunity.value || ''} onChange={handleChange} className="text-2xl font-bold h-12 text-right"/>
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
                  <Textarea id="bonificacionDetalle" name="bonificacionDetalle" value={editedOpportunity.bonificacionDetalle || ''} onChange={handleChange} disabled={!canEditBonus} placeholder={!canEditBonus ? 'Se genera automáticamente si el valor final es menor al tarifario' : 'Ej: 10% Descuento'}/>
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
              <h3 className="font-semibold">Períodos de Pauta</h3>
              <div className="space-y-2">
                  {(editedOpportunity.pautados || []).map((pautado, index) => (
                      <div key={pautado.id} className="flex items-end gap-2">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                  <Label>Fecha de Inicio</Label>
                                  <Input type="date" value={pautado.fechaInicio} onChange={e => handlePautadoChange(pautado.id, 'fechaInicio', e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                  <Label>Fecha de Fin</Label>
                                  <Input type="date" value={pautado.fechaFin} onChange={e => handlePautadoChange(pautado.id, 'fechaFin', e.target.value)} />
                              </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleRemovePautado(pautado.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                  ))}
              </div>
              <Button variant="outline" size="sm" onClick={handleAddPautado}><PlusCircle className="mr-2 h-4" /> Añadir Período</Button>
          </TabsContent>

          <TabsContent value="invoicing" className="space-y-4 py-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold">Facturas Asociadas</h3>
                <Button size="sm" variant="outline" onClick={handleAddInvoice}><PlusCircle className="mr-2 h-4 w-4"/>Añadir Factura</Button>
            </div>
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {invoices.length > 0 ? invoices.map(invoice => (
                        <TableRow key={invoice.id}>
                            <TableCell><Input value={invoice.invoiceNumber} onChange={e => handleInvoiceChange(invoice.id, 'invoiceNumber', e.target.value)} /></TableCell>
                            <TableCell><Input type="date" value={invoice.date} onChange={e => handleInvoiceChange(invoice.id, 'date', e.target.value)} /></TableCell>
                            <TableCell><Input type="number" value={invoice.amount} onChange={e => handleInvoiceChange(invoice.id, 'amount', Number(e.target.value))} /></TableCell>
                            <TableCell>
                                <Select value={invoice.status} onValueChange={(v: InvoiceStatus) => handleInvoiceChange(invoice.id, 'status', v)}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        {invoiceStatusOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleInvoiceUpdate(invoice.id)}><Save className="h-4 w-4"/></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleInvoiceDelete(invoice.id)}><Trash2 className="h-4 w-4"/></Button>
                            </TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center h-24">No hay facturas cargadas.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
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
     {isOrdenPautadoFormOpen && opportunity && userInfo && (
        <OrdenPautadoFormDialog
            isOpen={isOrdenPautadoFormOpen}
            onOpenChange={setIsOrdenPautadoFormOpen}
            opportunity={opportunity}
            client={client || { id: opportunity.clientId, name: opportunity.clientName }}
            userInfo={userInfo}
        />
     )}
     </>
  );
}
