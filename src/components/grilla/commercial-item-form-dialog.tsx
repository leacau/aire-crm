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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CommercialItem } from '@/lib/types';
import { commercialItemTypes, commercialItemStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { getClients } from '@/lib/firebase-service'; // Assuming you have this
import type { Client } from '@/lib/types';

interface CommercialItemFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (item: Omit<CommercialItem, 'id' | 'date' | 'programId'>) => void;
  item?: CommercialItem | null;
}

export function CommercialItemFormDialog({ isOpen, onOpenChange, onSave, item }: CommercialItemFormDialogProps) {
  const [type, setType] = useState<CommercialItem['type']>('Pauta');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<CommercialItem['status']>('Disponible');
  const [clientId, setClientId] = useState<string | undefined>();
  const [clients, setClients] = useState<Client[]>([]);
  const { toast } = useToast();

  React.useEffect(() => {
    // Fetch clients when dialog opens
    if (isOpen) {
      getClients().then(setClients).catch(err => console.error("Failed to fetch clients", err));
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!description.trim()) {
      toast({ title: 'La descripción es obligatoria', variant: 'destructive' });
      return;
    }
    const clientName = clients.find(c => c.id === clientId)?.denominacion;
    onSave({ type, description, status, clientId, clientName });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Editar' : 'Nuevo'} Elemento Comercial</DialogTitle>
          <DialogDescription>
            Añade un nuevo espacio comercial a la grilla.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-type">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as CommercialItem['type'])}>
                <SelectTrigger id="item-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {commercialItemTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-status">Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CommercialItem['status'])}>
                <SelectTrigger id="item-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {commercialItemStatus.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-description">Descripción</Label>
            <Textarea id="item-description" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          {status !== 'Disponible' && (
            <div className="space-y-2">
              <Label htmlFor="item-client">Cliente</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="item-client"><SelectValue placeholder="Asignar cliente..." /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
