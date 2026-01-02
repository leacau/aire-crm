
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
import type { CommercialItem, Client } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';

type ItemType = 'PNT' | 'Auspicio' | 'Nota';

interface PntAuspicioFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (data: Omit<CommercialItem, 'id' | 'date' | 'programId'>) => void;
  clients: Client[];
}

export function PntAuspicioFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  clients,
}: PntAuspicioFormDialogProps) {
  const { toast } = useToast();
  const [type, setType] = useState<ItemType>('PNT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bloque, setBloque] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    if (!title.trim() || !description.trim()) {
      toast({ title: 'Campos requeridos', description: 'El título y el texto no pueden estar vacíos.', variant: 'destructive' });
      return;
    }
    if (type === 'Auspicio' && !bloque.trim()) {
      toast({ title: 'Campo requerido', description: 'La sección/bloque es obligatoria para los auspicios.', variant: 'destructive' });
      return;
    }
    
    setIsSaving(true);
    const selectedClient = clients.find(c => c.id === selectedClientId);

    onSave({
      type,
      title,
      description,
      bloque: type === 'Auspicio' ? bloque : undefined,
      clientId: selectedClient?.id,
      clientName: selectedClient?.denominacion,
    } as any);

    // Reset form and close
    setTimeout(() => {
        setTitle('');
        setDescription('');
        setBloque('');
        setSelectedClientId(undefined);
        setType('PNT');
        setIsSaving(false);
        onOpenChange(false);
    }, 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva Pauta</DialogTitle>
          <DialogDescription>
            Completa los datos para añadir un nuevo elemento a la pauta del día.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="space-y-2">
            <Label htmlFor="item-type">Tipo de Elemento</Label>
            <Select value={type} onValueChange={(v: ItemType) => setType(v)}>
                <SelectTrigger id="item-type"><SelectValue/></SelectTrigger>
                <SelectContent>
                    <SelectItem value="PNT">PNT (Publicidad No Tradicional)</SelectItem>
                    <SelectItem value="Auspicio">Auspicio</SelectItem>
                    <SelectItem value="Nota">Nota</SelectItem>
                </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Identificador rápido. Ej: Promo Verano Bica"/>
          </div>

          {type === 'Auspicio' && (
             <div className="space-y-2">
                <Label htmlFor="bloque">Sección / Bloque</Label>
                <Input id="bloque" value={bloque} onChange={(e) => setBloque(e.target.value)} placeholder="Ej: Deportes, Clima, Política..."/>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Texto a leer</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5}/>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cliente">Cliente (Opcional)</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger id="cliente"><SelectValue placeholder="Asignar a un cliente..."/></SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">Ninguno</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
