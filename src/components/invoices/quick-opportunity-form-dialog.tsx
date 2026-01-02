'use client';

import React, { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import type { Opportunity } from '@/lib/types';

interface QuickOpportunityFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  client: { id: string; name: string };
  onSave: (opportunity: Omit<Opportunity, 'id'>) => void;
}

export function QuickOpportunityFormDialog({ isOpen, onOpenChange, client, onSave }: QuickOpportunityFormDialogProps) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState<number | string>('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!title.trim() || !value || Number(value) <= 0) {
      toast({ title: "Datos incompletos", description: "El título y un valor mayor a cero son obligatorios.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    
    const newOpportunity: Omit<Opportunity, 'id'> = {
      title,
      value: Number(value),
      clientId: client.id,
      clientName: client.name,
      stage: 'Cerrado - Ganado',
      closeDate: new Date().toISOString().split('T')[0],
    };
    
    onSave(newOpportunity);

    // Reset state after save handled by parent
    setTimeout(() => {
        setTitle('');
        setValue('');
        setIsSaving(false);
    }, 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva Oportunidad Rápida</DialogTitle>
          <DialogDescription>
            Creando una nueva oportunidad para el cliente <strong>{client.name}</strong>. Se creará como "Cerrado - Ganado".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="opp-title">Título de la Oportunidad</Label>
            <Input
              id="opp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Pauta Mensual Diciembre"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="opp-value">Valor de la Oportunidad</Label>
            <Input
              id="opp-value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" /> : 'Crear y Seleccionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
