

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
import type { Canje, CanjeEstado, CanjeTipo, Client, User, CanjeEstadoFinal } from '@/lib/types';
import { canjeEstados, canjeTipos, canjeEstadoFinalOptions } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { PlusCircle, Trash2, CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

const initialFormData = (user: User): CanjeFormData => {
    return {
        titulo: '',
        clienteId: undefined,
        clienteName: '',
        asesorId: undefined, // Will be set on client selection
        asesorName: '',
        pedido: '',
        fechaResolucion: undefined,
        facturas: [],
        valorAsociado: 0,
        valorCanje: 0,
        estado: 'Pedido',
        tipo: 'Temporario',
        observaciones: '',
        estadoFinal: undefined,
        comentarioFinal: '',
        fechaCulminacion: undefined,
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
  const [isManualClient, setIsManualClient] = useState(false);

  const { toast } = useToast();

  const isEditing = canje !== null;
  const canManageAll = currentUser.role === 'Jefe' || currentUser.role === 'Gerencia' || currentUser.role === 'Administracion';

  useEffect(() => {
    if (isOpen) {
      if (canje) {
        setFormData({ ...initialFormData(currentUser), ...canje });
        setIsManualClient(!canje.clienteId);
      } else {
        setFormData(initialFormData(currentUser));
        setIsManualClient(false);
      }
      setIsSaving(false);
    }
  }, [canje, isOpen, currentUser]);

  const handleSave = async () => {
    if (!formData.titulo.trim() || !formData.pedido.trim()) {
      toast({ title: "Campos requeridos", description: "El título y el pedido son obligatorios.", variant: "destructive" });
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
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleClientSelection = (clientId: string) => {
    if (clientId === 'manual') {
        setIsManualClient(true);
        setFormData(prev => ({
            ...prev,
            clienteId: undefined,
            clienteName: '',
            asesorId: undefined,
            asesorName: '',
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
  
  const handleDateChange = (field: 'fechaResolucion' | 'fechaCulminacion', date?: Date) => {
    setFormData(prev => ({
        ...prev,
        [field]: date ? date.toISOString().split('T')[0] : undefined
    }));
  };

  const handleAddFactura = () => {
    setFormData(prev => ({ ...prev, facturas: [...(prev.facturas || []), { numero: '', monto: 0 }] }));
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
    setFormData(prev => ({ ...prev, facturas: (prev.facturas || []).filter((_, i) => i !== index) }));
  };

  // Determine editable fields based on role and state
  const isCreator = canManageAll;
  const isAssignedAdvisor = formData.asesorId === currentUser.id;

  const canEditPedido = isCreator && formData.estado === 'Pedido';
  const canEditAsignacion = canManageAll && !formData.clienteId;
  const canEditNegociacion = isAssignedAdvisor && ['En gestión', 'Pedido'].includes(formData.estado);
  const canEditCulminacion = canManageAll && formData.estado === 'Culminado';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Canje' : 'Nuevo Pedido de Canje'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles del canje según su estado.' : 'Completa los datos para crear un nuevo pedido.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto pr-4">
          
          {/* Seccion Pedido */}
          <fieldset disabled={!isCreator && isEditing} className="space-y-4 p-4 border rounded-md">
            <legend className="font-semibold px-1 text-primary">1. Pedido de Canje</legend>
            <div className="space-y-2">
              <Label htmlFor="titulo">Título del Canje</Label>
              <Input id="titulo" name="titulo" value={formData.titulo} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pedido">Detalle del Pedido</Label>
              <Textarea id="pedido" name="pedido" value={formData.pedido || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label>Fecha de Resolución Necesaria</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.fechaResolucion && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.fechaResolucion ? format(new Date(formData.fechaResolucion), "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.fechaResolucion ? new Date(formData.fechaResolucion) : undefined} onSelect={(d) => handleDateChange('fechaResolucion', d)} initialFocus /></PopoverContent>
              </Popover>
            </div>
          </fieldset>

          {/* Seccion Asignacion */}
          <fieldset disabled={!canManageAll && isEditing} className="space-y-4 p-4 border rounded-md">
            <legend className="font-semibold px-1 text-primary">2. Asignación</legend>
            <div className="space-y-2">
              <Label htmlFor="clienteId">Cliente</Label>
              {isManualClient ? ( <Input name="clienteName" placeholder="Nombre del cliente potencial" value={formData.clienteName} onChange={handleChange} /> ) : (
                <Select value={formData.clienteId || ''} onValueChange={handleClientSelection}><SelectTrigger id="clienteId"><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                  <SelectContent><SelectItem value="manual">Ingresar cliente nuevo...</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Asesor Asignado</Label>
              <Input value={formData.asesorName || 'Se asignará con el cliente'} disabled />
            </div>
          </fieldset>
          
          {/* Seccion Negociacion y Resolucion */}
          <fieldset disabled={!canEditNegociacion && !canManageAll} className="space-y-4 p-4 border rounded-md">
            <legend className="font-semibold px-1 text-primary">3. Negociación y Resolución</legend>
            <div className="space-y-2">
              <Label htmlFor="observaciones">Contraprestación / Observaciones</Label>
              <Textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleChange} placeholder="Detallar la contraprestación del canje aquí..." />
            </div>
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valorCanje">Valor Canje</Label>
                <Input id="valorCanje" name="valorCanje" type="number" value={formData.valorCanje} onChange={handleChange} />
              </div>
               <div className="space-y-2">
                <Label htmlFor="estado">Estado del Proceso</Label>
                <Select name="estado" value={formData.estado} onValueChange={(value: CanjeEstado) => handleSelectChange('estado', value)}>
                  <SelectTrigger id="estado"><SelectValue /></SelectTrigger>
                  <SelectContent>{canjeEstados.filter(e => e !== 'Aprobado').map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>
          
           {/* Seccion Aprobacion Final */}
           <fieldset disabled={!canEditCulminacion} className="space-y-4 p-4 border rounded-md bg-muted/30">
            <legend className="font-semibold px-1 text-primary">4. Aprobación Final (Gerencia)</legend>
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <Label>Fecha de Culminación</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.fechaCulminacion && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.fechaCulminacion ? format(new Date(formData.fechaCulminacion), "PPP", { locale: es }) : <span>Fecha final</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.fechaCulminacion ? new Date(formData.fechaCulminacion) : undefined} onSelect={(d) => handleDateChange('fechaCulminacion', d)} initialFocus /></PopoverContent>
                </Popover>
               </div>
               <div className="space-y-2">
                  <Label htmlFor="estadoFinal">Estado Final</Label>
                  <Select name="estadoFinal" value={formData.estadoFinal || ''} onValueChange={(v: CanjeEstadoFinal) => handleSelectChange('estadoFinal', v)}>
                    <SelectTrigger id="estadoFinal"><SelectValue placeholder="Total / Parcial..." /></SelectTrigger>
                    <SelectContent>{canjeEstadoFinalOptions.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
               </div>
             </div>
             <div className="space-y-2">
                <Label htmlFor="comentarioFinal">Comentario Final</Label>
                <Textarea id="comentarioFinal" name="comentarioFinal" value={formData.comentarioFinal || ''} onChange={handleChange} placeholder="Añadir comentarios si la culminación fue parcial..." />
             </div>
             <Button size="sm" onClick={() => handleSelectChange('estado', 'Aprobado')} disabled={formData.estado === 'Aprobado'}>
                Marcar como Aprobado y Finalizado
             </Button>
           </fieldset>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" color="white" /> : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
