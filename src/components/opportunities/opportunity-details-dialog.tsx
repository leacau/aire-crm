
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
import type { Opportunity, OpportunityStage } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface OpportunityDetailsDialogProps {
  opportunity: Opportunity | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUpdate: (opportunity: Partial<Opportunity>) => void;
  onCreate?: (opportunity: Omit<Opportunity, 'id'>) => void;
  client?: {id: string, name: string}
}

const getInitialOpportunityData = (userInfo: any, client: any): Omit<Opportunity, 'id'> => ({
    title: '',
    details: '',
    value: 0,
    stage: 'Nuevo',
    observaciones: '',
    closeDate: new Date().toISOString().split('T')[0],
    clientName: client?.name || '',
    clientId: client?.id || '',
    ownerId: userInfo?.id || '',
    pagado: false,
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
      return getInitialOpportunityData(userInfo, client);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedOpportunity(prev => ({
      ...prev,
      [name]: name === 'value' || name === 'valorCerrado' ? Number(value) : value,
    }));
  };

  const handleStageChange = (stage: OpportunityStage) => {
    setEditedOpportunity(prev => ({ ...prev, stage }));
  };

  const handleCheckboxChange = (checked: boolean | "indeterminate") => {
    setEditedOpportunity(prev => ({...prev, pagado: !!checked }));
  }

  const isCloseWon = editedOpportunity.stage === 'Cerrado - Ganado';
  const isInvoiceSet = !!editedOpportunity.facturaNo;

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
