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

interface OpportunityDetailsDialogProps {
  opportunity: Opportunity;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUpdate: (opportunity: Opportunity) => void;
}

export function OpportunityDetailsDialog({
  opportunity,
  isOpen,
  onOpenChange,
  onUpdate,
}: OpportunityDetailsDialogProps) {
  const [editedOpportunity, setEditedOpportunity] = React.useState<Opportunity>(opportunity);

  React.useEffect(() => {
    setEditedOpportunity(opportunity);
  }, [opportunity]);

  const handleSave = () => {
    onUpdate(editedOpportunity);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditedOpportunity(prev => ({
      ...prev,
      [name]: name === 'value' ? Number(value) : value,
    }));
  };

  const handleStageChange = (stage: OpportunityStage) => {
    setEditedOpportunity(prev => ({ ...prev, stage }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Detalles de la Oportunidad</DialogTitle>
          <DialogDescription>
            Edita los detalles de la oportunidad. Haz clic en guardar cuando hayas terminado.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Título
            </Label>
            <Input
              id="title"
              name="title"
              value={editedOpportunity.title}
              onChange={handleChange}
              className="col-span-3"
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
              value={editedOpportunity.value}
              onChange={handleChange}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="stage" className="text-right">
              Etapa
            </Label>
            <Select onValueChange={handleStageChange} defaultValue={editedOpportunity.stage}>
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
            <Label htmlFor="details" className="text-right">
              Detalles
            </Label>
            <Textarea
              id="details"
              name="details"
              value={editedOpportunity.details || ''}
              onChange={handleChange}
              className="col-span-3"
              placeholder="Añade una descripción o notas sobre la oportunidad..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
