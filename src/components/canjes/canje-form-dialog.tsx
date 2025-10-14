
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
import type { Canje, CanjeEstado, CanjeTipo, Client, User } from '@/lib/types';
import { canjeEstados, canjeTipos } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { PlusCircle, Trash2 } from 'lucide-react';

type CanjeFormData = Omit<Canje, 'id' | 'fechaCreacion'>;

interface CanjeFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (canjeData: CanjeFormData) => void;
  canje?: Canje | null;
  clients: Client[];
  users: User[];
  currentUser: User;
}

const initialFormData = (user: User, clients: Client[]): CanjeFormData => {
    const firstClient = clients.find(c => c.ownerId === user.id) || clients[0];
    return {
        titulo: '',
        clienteId: firstClient?.id || '',
        clienteName: firstClient?.denominacion || '',
        asesorId: user.id,
        asesorName: user.name,
        facturas: [],
        valorAsociado: 0,
        valorCanje: 0,
        estado: 'Pedido',
        tipo: 'Temporario',
        observaciones: '',
    };
};

export function CanjeFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  canje = null,
  clients,
  users,
  currentUser,
}: CanjeFormDialogProps) {
  const [formData, setFormData] = useState<CanjeFormData>(initialFormData(currentUser, clients));
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const isEditing = canje !== null;
  const canApprove = currentUser.role === 'Jefe' || currentUser.role === 'Gerencia' || currentUser.role === 'Administracion';

  useEffect(() => {
    if (isOpen) {
      if (canje) {
        setFormData({
            ...canje,
            valorAsociado: canje.valorAsociado || 0,
            valorCanje: canje.valorCanje || 0,
            facturas: canje.facturas || [],
        });
      } else {
        setFormData(initialFormData(currentUser, clients));
      }
      setIsSaving(false);
    }
  }, [canje, isOpen, currentUser, clients]);

  const handleSave = async () => {
    if (!formData.titulo.trim() || !formData.clienteId) {
      toast({ title: "Campos requeridos", description: "El título y el cliente son obligatorios.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    onSave(formData);
    onOpenChange(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: (name === 'valorAsociado' || name === 'valorCanje') ? Number(value) : value,
    }));
  };

  const handleSelectChange = (name: keyof CanjeFormData, value: string) => {
    if (name === 'clienteId') {
        const selectedClient = clients.find(c => c.id === value);
        const owner = users.find(u => u.id === selectedClient?.ownerId);
        setFormData(prev => ({
            ...prev,
            clienteId: value,
            clienteName: selectedClient?.denominacion || '',
            asesorId: owner?.id || '',
            asesorName: owner?.name || '',
        }));
    } else {
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    }
  };

  const handleAddFactura = () => {
    setFormData(prev => ({
      ...prev,
      facturas: [...(prev.facturas || []), { numero: '', monto: 0 }],
    }));
  };

  const handleFacturaChange = (index: number, field: 'numero' | 'monto', value: string | number) => {
    setFormData(prev => {
      const newFacturas = [...(prev.facturas || [])];
      // @ts-ignore
      newFacturas[index][field] = value;
      return { ...prev, facturas: newFacturas };
    });
  };

  const handleRemoveFactura = (index: number) => {
    setFormData(prev => ({
      ...prev,
      facturas: (prev.facturas || []).filter((_, i) => i !== index),
    }));
  };


  const availableEstados = canApprove ? canjeEstados : canjeEstados.filter(e => e !== 'Aprobado');


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Canje' : 'Nuevo Canje'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles del canje.' : 'Completa los datos para crear un nuevo canje.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          
          <div className="space-y-2">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" name="titulo" value={formData.titulo} onChange={handleChange} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clienteId">Cliente</Label>
            <Select name="clienteId" value={formData.clienteId} onValueChange={(value) => handleSelectChange('clienteId', value)}>
              <SelectTrigger id="clienteId"><SelectValue /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Asesor Asignado</Label>
            <Input value={formData.asesorName} disabled />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select name="estado" value={formData.estado} onValueChange={(value: CanjeEstado) => handleSelectChange('estado', value)}>
                <SelectTrigger id="estado"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableEstados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select name="tipo" value={formData.tipo} onValueChange={(value: CanjeTipo) => handleSelectChange('tipo', value)}>
                <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {canjeTipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="valorAsociado">Valor Asociado</Label>
              <Input id="valorAsociado" name="valorAsociado" type="number" value={formData.valorAsociado} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorCanje">Valor Canje</Label>
              <Input id="valorCanje" name="valorCanje" type="number" value={formData.valorCanje} onChange={handleChange} />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label>Facturas</Label>
                <Button variant="ghost" size="sm" onClick={handleAddFactura}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Añadir
                </Button>
            </div>
             <div className="space-y-2">
                {(formData.facturas || []).map((factura, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <Input 
                            placeholder="Número de Factura" 
                            value={factura.numero} 
                            onChange={(e) => handleFacturaChange(index, 'numero', e.target.value)}
                        />
                        <Input 
                            type="number"
                            placeholder="Monto" 
                            value={factura.monto} 
                            onChange={(e) => handleFacturaChange(index, 'monto', Number(e.target.value))}
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveFactura(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="observaciones">Observaciones</Label>
            <Textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleChange} />
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
