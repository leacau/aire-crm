
'use client';

import React from 'react';
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
import type { Opportunity, OpportunityStage, BonificacionEstado } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
    bonificacionPorcentaje: 0,
});

export function OpportunityDetailsDialog({
  opportunity,
  isOpen,
  onOpenChange,
  onUpdate,
  onCreate = () => {},
  client
}: OpportunityDetailsDialogProps) {
  const { userInfo } = useAuth();
  const { toast } = useToast();

  const getInitialData = () => {
      if (opportunity) return { ...opportunity };
      return getInitialOpportunityData(client);
  }

  const [editedOpportunity, setEditedOpportunity] = React.useState<Partial<Opportunity>>(getInitialData());

  React.useEffect(() => {
    if (isOpen) {
        setEditedOpportunity(getInitialData());
    }
  }, [opportunity, isOpen, userInfo, client]);

  const isEditing = opportunity !== null;

  const handleSave = async () => {
    if (isEditing && opportunity) {
      const changes = Object.keys(editedOpportunity).reduce((acc, key) => {
        const oppKey = key as keyof Opportunity;
        // @ts-ignore
        if (editedOpportunity[oppKey] !== opportunity[oppKey]) {
          // @ts-ignore
          acc[oppKey] = editedOpportunity[oppKey];
        }
        return acc;
      }, {} as Partial<Opportunity>);

      if (Object.keys(changes).length > 0) {
          onUpdate(changes);
      }
    } else if (!isEditing) {
        const newOpp = editedOpportunity as Omit<Opportunity, 'id'>;
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

    if (name === 'value' || name === 'valorCerrado' || name === 'bonificacionPorcentaje') {
        finalValue = Number(value);
    }

    setEditedOpportunity(prev => {
        const newState: Partial<Opportunity> = { ...prev, [name]: finalValue };
        
        if (name === 'bonificacionPorcentaje') {
            const bonusValue = Number(value);
            if (bonusValue > 0) {
                // Only set to pending if it's not already decided
                if (prev.bonificacionEstado !== 'Autorizado' && prev.bonificacionEstado !== 'Rechazado') {
                    newState.bonificacionEstado = 'Pendiente';
                }
            } else {
                // If bonus is 0 or less, it shouldn't be in the approval process
                delete newState.bonificacionEstado;
                delete newState.bonificacionAutorizadoPorId;
                delete newState.bonificacionAutorizadoPorNombre;
                delete newState.bonificacionFechaAutorizacion;
            }
        }

        return newState;
    });
  };

  const handleStageChange = (stage: OpportunityStage) => {
    setEditedOpportunity(prev => ({ ...prev, stage }));
  };

  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
    setEditedOpportunity(prev => ({...prev, pagado: !!checked }));
  }

  const isCloseWon = editedOpportunity.stage === 'Cerrado - Ganado';
  const isInvoiceSet = !!editedOpportunity.facturaNo;
  const hasBonus = (editedOpportunity.bonificacionPorcentaje || 0) > 0;
  const isJefe = userInfo?.role === 'Jefe';
  const isJefeOrAdmin = userInfo?.role === 'Jefe' || userInfo?.role === 'Administracion';


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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Detalles de la Oportunidad' : 'Nueva Oportunidad'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Edita los detalles de la oportunidad.' : 'Rellena los datos para crear una nueva oportunidad.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Título
            </Label>
            <Input
              id="title"
              name="title"
              value={editedOpportunity.title || ''}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="details" className="text-right">
              Descripción
            </Label>
            <Textarea
              id="details"
              name="details"
              value={editedOpportunity.details || ''}
              onChange={handleChange}
              className="col-span-3"
              placeholder="Añade una descripción de la oportunidad..."
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="value" className="text-right">
              Valor
            </Label>
            <Input
              id="value"
              name="value"
              type="number"
              value={editedOpportunity.value || 0}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="stage" className="text-right">
              Etapa
            </Label>
            <Select onValueChange={handleStageChange} value={editedOpportunity.stage}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Selecciona una etapa" />
              </SelectTrigger>
              <SelectContent>
                {opportunityStages.map(stage => (
                  <SelectItem key={stage} value={stage}>
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="observaciones" className="text-right">
              Observaciones
            </Label>
            <Textarea
              id="observaciones"
              name="observaciones"
              value={editedOpportunity.observaciones || ''}
              onChange={handleChange}
              className="col-span-3"
              placeholder="Añade notas o comentarios..."
            />
          </div>

          {isEditing && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="facturaNo" className="text-right">
                  Factura Nº
                </Label>
                <Input
                  id="facturaNo"
                  name="facturaNo"
                  value={editedOpportunity.facturaNo || ''}
                  onChange={handleChange}
                  className="col-span-3"
                  disabled={!isCloseWon}
                  placeholder={!isCloseWon ? 'Solo para Cierre Ganado' : ''}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="valorCerrado" className="text-right">
                  Valor Cerrado
                </Label>
                <Input
                  id="valorCerrado"
                  name="valorCerrado"
                  type="number"
                  value={editedOpportunity.valorCerrado || editedOpportunity.value || 0}
                  onChange={handleChange}
                  className="col-span-3"
                  disabled={!isCloseWon}
                   placeholder={!isCloseWon ? 'Solo para Cierre Ganado' : ''}
                />
              </div>
               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="propuestaCerrada" className="text-right">
                  Propuesta Cerrada
                </Label>
                <Input
                  id="propuestaCerrada"
                  name="propuestaCerrada"
                  value={editedOpportunity.propuestaCerrada || ''}
                  onChange={handleChange}
                  className="col-span-3"
                  disabled={!isCloseWon}
                  placeholder={!isCloseWon ? 'Solo para Cierre Ganado' : ''}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pagado" className="text-right">
                  Pagado
                </Label>
                <div className="col-span-3 flex items-center">
                    <Checkbox
                        id="pagado"
                        checked={editedOpportunity.pagado}
                        onCheckedChange={handleCheckboxChange}
                        disabled={!isInvoiceSet}
                    />
                </div>
              </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="bonificacionPorcentaje" className="text-right">
                    Bonificación %
                    </Label>
                    <Input
                    id="bonificacionPorcentaje"
                    name="bonificacionPorcentaje"
                    type="number"
                    value={editedOpportunity.bonificacionPorcentaje || 0}
                    onChange={handleChange}
                    className="col-span-3"
                    disabled={!isCloseWon}
                    placeholder={!isCloseWon ? 'Solo para Cierre Ganado' : ''}
                    />
              </div>
              {hasBonus && isJefeOrAdmin && (
                    <div className="grid grid-cols-1 gap-3 p-3 mt-2 border rounded-lg bg-muted/50 col-span-full">
                        <h4 className="font-semibold text-sm">Gestión de Bonificación</h4>
                        <div className="flex items-center justify-between">
                            <Label>Estado</Label>
                            {getBonusStatusPill(editedOpportunity.bonificacionEstado)}
                        </div>
                        
                        {editedOpportunity.bonificacionEstado === 'Pendiente' && isJefe && (
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
