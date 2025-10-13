
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
import type { Opportunity, OpportunityStage, BonificacionEstado, Agency, Periodicidad, FormaDePago, ProposalFile } from '@/lib/types';
import { periodicidadOptions, formaDePagoOptions } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAgencies, createAgency } from '@/lib/firebase-service';
import { PlusCircle } from 'lucide-react';
import { Spinner } from '../ui/spinner';
import { LinkifiedText } from '@/components/ui/linkified-text';

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
    pagado: false,
    bonificacionDetalle: '',
    periodicidad: [],
    facturaPorAgencia: false,
    formaDePago: [],
    fechaFacturacion: '',
    fechaInicioPauta: '',
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
  const { userInfo, isBoss } = useAuth();
  const { toast } = useToast();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  
  const getInitialData = () => {
      if (opportunity) return { ...opportunity };
      return getInitialOpportunityData(client);
  }

  const [editedOpportunity, setEditedOpportunity] = React.useState<Partial<Opportunity>>(getInitialData());

  useEffect(() => {
    if (isOpen) {
        setEditedOpportunity(getInitialData());
        
        getAgencies().then(setAgencies).catch(() => {
            toast({ title: "Error al cargar agencias", variant: "destructive" });
        });
    }
  }, [opportunity, isOpen, userInfo, client, toast]);
  
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
        
        // This is a special check for arrays of objects
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
    let finalValue: string | number = value;

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

  const isCloseWon = editedOpportunity.stage === 'Cerrado - Ganado';
  const canEditBonus = editedOpportunity.stage === 'Negociación' || editedOpportunity.stage === 'Cerrado - Ganado' || editedOpportunity.stage === 'Negociación a Aprobar';
  const isInvoiceSet = !!editedOpportunity.facturaNo;
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
  
  type EditableField = 'details' | 'observaciones' | 'propuestaCerrada' | 'bonificacionObservaciones';
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  const renderEditableTextarea = (field: EditableField, label: string) => {
    const isEditingThisField = editingField === field;
    const value = editedOpportunity[field] || '';
    let isDisabled = false;

    if (field === 'propuestaCerrada' && !isCloseWon) {
        isDisabled = true;
    }
    if (field === 'bonificacionObservaciones' && !isBoss) {
        isDisabled = true;
    }


    return (
        <div className="space-y-2">
            <Label htmlFor={field} onClick={() => !isDisabled && setEditingField(field)}>{label}</Label>
            {isEditingThisField ? (
                <Textarea
                    id={field}
                    name={field}
                    value={value}
                    onChange={handleChange}
                    onBlur={() => setEditingField(null)}
                    autoFocus
                    disabled={isDisabled}
                    placeholder={isDisabled ? 'No disponible' : ''}
                />
            ) : (
                <div
                    onClick={() => !isDisabled && setEditingField(field)}
                    className={cn(
                        "min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        isDisabled ? "cursor-not-allowed opacity-50" : "cursor-text"
                    )}
                >
                    {value ? (
                        <LinkifiedText text={value} />
                    ) : (
                        <span className="text-muted-foreground">
                            {isDisabled ? 'No disponible' : `Clic para editar...`}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Detalles de la Oportunidad' : 'Nueva Oportunidad'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Edita los detalles de la oportunidad.' : 'Rellena los datos para crear una nueva oportunidad.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
           <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" value={editedOpportunity.title || ''} onChange={handleChange}/>
          </div>
          {renderEditableTextarea('details', 'Descripción')}

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
             <div className="space-y-2">
                <Label htmlFor="fechaInicioPauta">Inicio de Pauta</Label>
                <Input 
                  id="fechaInicioPauta" 
                  name="fechaInicioPauta" 
                  type="date"
                  value={editedOpportunity.fechaInicioPauta || ''}
                  onChange={handleChange}
                />
            </div>
          </div>
          
           {renderEditableTextarea('observaciones', 'Observaciones')}

          {isEditing && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="facturaNo">Factura Nº</Label>
                  <Input id="facturaNo" name="facturaNo" value={editedOpportunity.facturaNo || ''} onChange={handleChange} disabled={!isCloseWon} placeholder={!isCloseWon ? 'Solo para Cierre Ganado' : ''}/>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="valorCerrado">Valor Cerrado</Label>
                    <Input id="valorCerrado" name="valorCerrado" type="number" value={editedOpportunity.valorCerrado || ''} onChange={handleChange} disabled={!isCloseWon} placeholder={!isCloseWon ? 'Solo para Cierre Ganado' : ''} />
                </div>
              </div>

               {renderEditableTextarea('propuestaCerrada', 'Propuesta Cerrada')}

               <div className="flex items-center space-x-2 pt-2">
                  <Checkbox id="pagado" name="pagado" checked={editedOpportunity.pagado} onCheckedChange={(c) => handleCheckboxChange('pagado', c)} disabled={!isInvoiceSet}/>
                  <Label htmlFor="pagado">Pagado</Label>
              </div>

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
                        
                        {renderEditableTextarea('bonificacionObservaciones', 'Observaciones de la Decisión')}

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
            </>
          )}

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
