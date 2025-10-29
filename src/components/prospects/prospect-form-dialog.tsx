

'use client';

import React, { useEffect, useState } from 'react';
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
import type { Prospect, ProspectStatus } from '@/lib/types';
import { prospectStatusOptions } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type ProspectFormData = Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName' | 'statusChangedAt'>;

interface ProspectFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (prospectData: ProspectFormData) => void;
  prospect?: Prospect | null;
}

const initialFormData: ProspectFormData = {
  companyName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  notes: '',
  status: 'Nuevo',
};

export function ProspectFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  prospect = null,
}: ProspectFormDialogProps) {
  const [formData, setFormData] = useState<ProspectFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const isEditing = prospect !== null;

  useEffect(() => {
    if (isOpen) {
      if (prospect) {
        setFormData({
          companyName: prospect.companyName,
          contactName: prospect.contactName || '',
          contactPhone: prospect.contactPhone || '',
          contactEmail: prospect.contactEmail || '',
          notes: prospect.notes || '',
          status: prospect.status,
        });
      } else {
        setFormData(initialFormData);
      }
      setIsSaving(false);
    }
  }, [prospect, isOpen]);

  const handleSave = async () => {
    if (!formData.companyName.trim()) {
      toast({ title: "Campo requerido", description: "El nombre de la empresa es obligatorio.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    onSave(formData);
    onOpenChange(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const filteredStatusOptions = prospectStatusOptions.filter(status => status !== 'Convertido' && status !== 'No Próspero');

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Prospecto' : 'Nuevo Prospecto'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles del prospecto.' : 'Rellena los datos para crear un nuevo prospecto.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="companyName" className="text-right">Empresa</Label>
            <Input id="companyName" name="companyName" value={formData.companyName} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contactName" className="text-right">Contacto</Label>
            <Input id="contactName" name="contactName" value={formData.contactName} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contactPhone" className="text-right">Teléfono</Label>
            <Input id="contactPhone" name="contactPhone" value={formData.contactPhone} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contactEmail" className="text-right">Email</Label>
            <Input id="contactEmail" name="contactEmail" type="email" value={formData.contactEmail} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Estado</Label>
            <Select value={formData.status} onValueChange={(value: ProspectStatus) => setFormData(p => ({...p, status: value}))}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>
                {filteredStatusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="notes" className="text-right">Notas</Label>
            <Textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} className="col-span-3" />
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
