

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
import { getAllUsers } from '@/lib/firebase-service';
import { NotificacionDialog } from './notificacion-dialog';

type CanjeFormData = Omit<Canje, 'id' | 'fechaCreacion'>;

interface CanjeFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (canjeData: CanjeFormData, managerEmails?: string[]) => void;
  canje?: Canje | null;
  clients: Client[];
  users: User[];
  currentUser: User;
}

const initialFormData = (user: User): CanjeFormData => {
    return {
        titulo: '',
        clienteId: undefined,
        clienteName: '',
        asesorId: user.id,
        asesorName: user.name,
        pedido: '',
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
  const [formData, setFormData] = useState<CanjeFormData>(initialFormData(currentUser));
  const [isSaving, setIsSaving] = useState(false);
  const [managers, setManagers] = useState<User[]>([]);
  const [showNotificacionDialog, setShowNotificacionDialog] = useState(false);
  const [originalState, setOriginalState] = useState<CanjeEstado | undefined>();
  const [isManualClient, setIsManualClient] = useState(false);

  const { toast } = useToast();

  const isEditing = canje !== null;
  const canApprove = currentUser.role === 'Jefe' || currentUser.role === 'Gerencia' || currentUser.role === 'Administracion';

  useEffect(() => {
    if (isOpen) {
      if (canje) {
        setFormData({
            ...canje,
            pedido: canje.pedido || '',
            valorAsociado: canje.valorAsociado || 0,
            valorCanje: canje.valorCanje || 0,
            facturas: canje.facturas || [],
        });
        setOriginalState(canje.estado);
        setIsManualClient(!canje.clienteId);
      } else {
        setFormData(initialFormData(currentUser));
        setOriginalState('Pedido');
        setIsManualClient(false);
      }
      setIsSaving(false);
      // Fetch managers
      Promise.all([
          getAllUsers('Jefe'),
          getAllUsers('Gerencia'),
          getAllUsers('Administracion'),
      ]).then(([jefes, gerentes, admins]) => {
          const combined = [...jefes, ...gerentes, ...admins];
          const uniqueManagers = Array.from(new Map(combined.map(item => [item.id, item])).values());
          setManagers(uniqueManagers);
      });
    }
  }, [canje, isOpen, currentUser]);

  const handleSave = async (managerEmails?: string[]) => {
    if (!formData.titulo.trim() || !formData.clienteName.trim()) {
      toast({ title: "Campos requeridos", description: "El título y el cliente son obligatorios.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    onSave(formData, managerEmails);
    onOpenChange(false);
  };
  
  const handleInitiateSave = () => {
    if (isEditing && originalState !== 'Completo' && formData.estado === 'Completo') {
        setShowNotificacionDialog(true);
    } else {
        handleSave();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: (name === 'valorAsociado' || name === 'valorCanje') ? Number(value) : value,
    }));
  };

  const handleSelectChange = (name: keyof CanjeFormData, value: string) => {
    setFormData(prev => ({
        ...prev,
        [name]: value,
    }));
  };
  
  const handleClientSelection = (clientId: string) => {
    if (clientId === 'manual') {
        setIsManualClient(true);
        setFormData(prev => ({
            ...prev,
            clienteId: undefined,
            clienteName: '',
            asesorId: currentUser.id,
            asesorName: currentUser.name,
        }));
    } else {
        setIsManualClient(false);
        const selectedClient = clients.find(c => c.id === clientId);
        const owner = users.find(u => u.id === selectedClient?.ownerId);
        setFormData(prev => ({
            ...prev,
            clienteId: clientId,
            clienteName: selectedClient?.denominacion || '',
            asesorId: owner?.id,
            asesorName: owner?.name || '',
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
    <>
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
            {isManualClient ? (
                 <Input 
                    name="clienteName" 
                    placeholder="Nombre del cliente potencial"
                    value={formData.clienteName} 
                    onChange={handleChange} 
                />
            ) : (
                <Select value={formData.clienteId || ''} onValueChange={handleClientSelection}>
                  <SelectTrigger id="clienteId"><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Ingresar cliente manualmente...</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                  </SelectContent>
                </Select>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>Asesor Asignado</Label>
            <Input value={formData.asesorName} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pedido">Pedido de Canje</Label>
            <Textarea id="pedido" name="pedido" value={formData.pedido || ''} onChange={handleChange} />
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
          <Button onClick={handleInitiateSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" color="white" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
     {showNotificacionDialog && (
        <NotificacionDialog
            isOpen={showNotificacionDialog}
            onOpenChange={setShowNotificacionDialog}
            managers={managers}
            onConfirm={(emails) => handleSave(emails)}
        />
    )}
    </>
  );
}
