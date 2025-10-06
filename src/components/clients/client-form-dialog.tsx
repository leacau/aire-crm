

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { provinciasArgentina, tipoEntidadOptions, condicionIVAOptions } from '@/lib/data';
import type { Client, TipoEntidad, CondicionIVA, Agency } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { getAgencies } from '@/lib/firebase-service';
import { Checkbox } from '../ui/checkbox';

type ClientFormData = Omit<Client, 'id' | 'personIds' | 'ownerId' | 'ownerName' | 'deactivationHistory' | 'newClientDate'>;

interface ClientFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (clientData: ClientFormData) => void;
  client?: Client | null;
  onValidateCuit: (cuit: string, clientId?: string) => Promise<string | false>;
}

const initialFormData: ClientFormData = {
  denominacion: '',
  razonSocial: '',
  cuit: '',
  condicionIVA: 'Consumidor Final',
  provincia: '',
  localidad: '',
  tipoEntidad: 'Privada',
  rubro: '',
  email: '',
  phone: '',
  observaciones: '',
  agencyId: undefined,
  isNewClient: false,
  isDeactivated: false,
};

export function ClientFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  client = null,
  onValidateCuit,
}: ClientFormDialogProps) {
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const { toast } = useToast();

  const isEditing = client !== null;

  useEffect(() => {
    if (isOpen) {
        if (client) {
            setFormData({
                denominacion: client.denominacion,
                razonSocial: client.razonSocial,
                cuit: client.cuit || '',
                condicionIVA: client.condicionIVA,
                provincia: client.provincia,
                localidad: client.localidad,
                tipoEntidad: client.tipoEntidad,
                rubro: client.rubro,
                email: client.email,
                phone: client.phone,
                observaciones: client.observaciones || '',
                agencyId: client.agencyId,
                isNewClient: client.isNewClient,
                isDeactivated: client.isDeactivated,
            });
        } else {
            setFormData(initialFormData);
        }
        getAgencies().then(setAgencies);
        setIsSaving(false);
    }
  }, [client, isOpen]);

  const handleSave = async () => {
    if (!formData.denominacion.trim()) {
        toast({ title: "Campo requerido", description: "La Denominación es obligatoria.", variant: "destructive"});
        return;
    }

    setIsSaving(true);
    
    if (formData.cuit) {
        const validationMessage = await onValidateCuit(formData.cuit, client?.id);

        if (validationMessage) {
            toast({
                title: "CUIT Duplicado",
                description: validationMessage,
                variant: "destructive",
                duration: 10000,
            });
            setIsSaving(false);
            return;
        }
    }
    
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

  const handleSelectChange = (name: keyof ClientFormData, value: string) => {
    setFormData(prev => ({
        ...prev,
        [name]: value === 'none' ? undefined : value,
    }));
  };

  const handleCheckboxChange = (name: keyof ClientFormData, checked: boolean | "indeterminate") => {
    setFormData(prev => ({...prev, [name]: !!checked }));
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          <DialogDescription>
            {isEditing 
                ? 'Actualiza los detalles del cliente. Haz clic en guardar cuando hayas terminado.'
                : 'Rellena los datos para crear un nuevo cliente.'
            }
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          {!isEditing && (
             <div className="flex items-center space-x-2">
                <Checkbox id="isNewClient" checked={formData.isNewClient} onCheckedChange={(checked) => handleCheckboxChange('isNewClient', checked)} />
                <Label htmlFor="isNewClient" className="font-normal">Marcar como Cliente Nuevo</Label>
            </div>
          )}
          {isEditing && (
             <div className="flex items-center space-x-2">
                <Checkbox id="isDeactivated" checked={formData.isDeactivated} onCheckedChange={(checked) => handleCheckboxChange('isDeactivated', checked)} />
                <Label htmlFor="isDeactivated" className="font-normal">Dar de baja al cliente</Label>
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="denominacion" className="text-right">
              Denominación
            </Label>
            <Input id="denominacion" name="denominacion" value={formData.denominacion} onChange={handleChange} className="col-span-3"/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="razonSocial" className="text-right">
              Razón Social
            </Label>
            <Input id="razonSocial" name="razonSocial" value={formData.razonSocial} onChange={handleChange} className="col-span-3"/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="cuit" className="text-right">
              CUIT
            </Label>
            <Input id="cuit" name="cuit" value={formData.cuit} onChange={handleChange} className="col-span-3"/>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="condicionIVA" className="text-right">
              Condición IVA
            </Label>
            <Select name="condicionIVA" value={formData.condicionIVA} onValueChange={(value: CondicionIVA) => handleSelectChange('condicionIVA', value)}>
                <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecciona una condición" />
                </SelectTrigger>
                <SelectContent>
                    {condicionIVAOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="provincia" className="text-right">
              Provincia
            </Label>
            <Select name="provincia" value={formData.provincia} onValueChange={(value) => handleSelectChange('provincia', value)}>
                <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecciona una provincia" />
                </SelectTrigger>
                <SelectContent>
                    {provinciasArgentina.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="localidad" className="text-right">
              Localidad
            </Label>
            <Input id="localidad" name="localidad" value={formData.localidad} onChange={handleChange} className="col-span-3"/>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="tipoEntidad" className="text-right">
              Tipo Entidad
            </Label>
             <Select name="tipoEntidad" value={formData.tipoEntidad} onValueChange={(value: TipoEntidad) => handleSelectChange('tipoEntidad', value)}>
                <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                    {tipoEntidadOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
            </Select>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rubro" className="text-right">
              Rubro
            </Label>
            <Input id="rubro" name="rubro" value={formData.rubro} onChange={handleChange} className="col-span-3"/>
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
            <Label htmlFor="agencyId" className="text-right">
              Agencia
            </Label>
             <Select name="agencyId" value={formData.agencyId || 'none'} onValueChange={(value) => handleSelectChange('agencyId', value)}>
                <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Asignar a una agencia (opcional)" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {agencies.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
            </Select>
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
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" color="white" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
