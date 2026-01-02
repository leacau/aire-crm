

'use client';

import React, { useEffect } from 'react';
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
import type { Person } from '@/lib/types';

type PersonFormData = Omit<Person, 'id' | 'clientIds'>;

interface PersonFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (personData: PersonFormData) => void;
  person?: Person | null;
}

const initialFormData: PersonFormData = {
  name: '',
  email: '',
  phone: '',
  cargo: '',
  observaciones: '',
};

export function PersonFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  person = null,
}: PersonFormDialogProps) {
  const [formData, setFormData] = React.useState<PersonFormData>(initialFormData);

  useEffect(() => {
    if (isOpen) {
        if (person) {
            setFormData({
                name: person.name,
                email: person.email || '',
                phone: person.phone || '',
                cargo: person.cargo || '',
                observaciones: person.observaciones || '',
            });
        } else {
            setFormData(initialFormData);
        }
    }
  }, [person, isOpen]);

  const handleSave = () => {
    onSave(formData);
    onOpenChange(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const isEditing = person !== null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle>
          <DialogDescription>
            {isEditing 
                ? 'Actualiza los detalles del contacto.'
                : 'Rellena los datos para crear un nuevo contacto.'
            }
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Nombre
            </Label>
            <Input id="name" name="name" value={formData.name} onChange={handleChange} className="col-span-3"/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="col-span-3"/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phone" className="text-right">
              Teléfono
            </Label>
            <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} className="col-span-3"/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="cargo" className="text-right">
              Cargo
            </Label>
            <Input id="cargo" name="cargo" value={formData.cargo} onChange={handleChange} className="col-span-3"/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="observaciones" className="text-right">
              Observaciones
            </Label>
            <Textarea id="observaciones" name="observaciones" value={formData.observaciones} onChange={handleChange} className="col-span-3"/>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
