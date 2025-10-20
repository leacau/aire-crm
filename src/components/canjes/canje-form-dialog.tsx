

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
import type { Canje, CanjeEstado, CanjeTipo, Client, User, CanjeEstadoFinal, HistorialMensualItem, HistorialMensualEstado } from '@/lib/types';
import { canjeEstados, canjeTipos, canjeEstadoFinalOptions, historialMensualEstados } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { PlusCircle, Trash2, CalendarIcon, Edit, Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format, getYear, getMonth, set, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
        asesorId: undefined,
        asesorName: '',
        pedido: '',
        fechaResolucion: undefined,
        facturas: [],
        valorAsociado: 0,
        valorCanje: 0,
        estado: 'Pedido',
        tipo: 'Una vez',
        observaciones: '',
        estadoFinal: undefined,
        comentarioFinal: '',
        fechaCulminacion: undefined,
        historialMensual: [],
    };
};

const generateMonthOptions = () => {
    const options: { label: string, value: string }[] = [];
    const today = new Date();
    for (let i = -24; i <= 24; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const year = getYear(date);
        const month = getMonth(date) + 1;
        const value = `${year}-${String(month).padStart(2, '0')}`;
        const label = format(date, "MMMM yyyy", { locale: es });
        options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options.reverse();
};
const monthOptions = generateMonthOptions();


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
  const [selectedMonth, setSelectedMonth] = useState('');
  const [editingMonth, setEditingMonth] = useState<string | null>(null);

  const { toast } = useToast();

  const isEditing = canje !== null;
  const canManageAll = currentUser.role === 'Jefe' || currentUser.role === 'Gerencia' || currentUser.role === 'Administracion';

  useEffect(() => {
    if (isOpen) {
      if (canje) {
        setFormData({ ...initialFormData(currentUser), ...canje });
      } else {
        setFormData(initialFormData(currentUser));
      }
      setIsSaving(false);
      setSelectedMonth('');
      setEditingMonth(null);
    }
  }, [canje, isOpen, currentUser]);

  const handleSave = async () => {
    if (!formData.titulo.trim() || !formData.pedido.trim()) {
      toast({ title: "Campos requeridos", description: "El título y el pedido son obligatorios.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    onSave(formData);
    // onOpenChange(false); // Let the parent component handle closing
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
    const selectedClient = clients.find(c => c.id === clientId);
    const owner = users.find(u => u.id === selectedClient?.ownerId);
    setFormData(prev => ({
        ...prev,
        clienteId: clientId,
        clienteName: selectedClient?.denominacion || '',
        asesorId: owner?.id,
        asesorName: owner?.name || '',
    }));
  };
  
  const handleDateChange = (field: 'fechaResolucion' | 'fechaCulminacion', date?: Date) => {
    setFormData(prev => ({
        ...prev,
        [field]: date ? date.toISOString().split('T')[0] : undefined
    }));
  };

  const handleRegisterMonth = () => {
    if (!selectedMonth || formData.historialMensual?.some(h => h.mes === selectedMonth)) {
        toast({ title: "Mes inválido o ya registrado", variant: "destructive" });
        return;
    }
    const newEntry: HistorialMensualItem = {
        mes: selectedMonth,
        estado: 'Pendiente',
        fechaEstado: new Date().toISOString(),
    };
    const newHistory = [...(formData.historialMensual || []), newEntry].sort((a, b) => b.mes.localeCompare(a.mes));
    setFormData(prev => ({...prev, historialMensual: newHistory }));
    handleSave(); // Save changes
  };
  
  const handleHistoryChange = (mes: string, field: keyof HistorialMensualItem, value: any) => {
      const updatedHistory = (formData.historialMensual || []).map(h => {
        if (h.mes === mes) {
            return {
                ...h,
                [field]: value,
                ...(field === 'estado' && {
                    fechaEstado: new Date().toISOString(),
                    responsableId: currentUser.id,
                    responsableName: currentUser.name,
                }),
            };
        }
        return h;
      }).sort((a, b) => b.mes.localeCompare(a.mes));
      setFormData(prev => ({ ...prev, historialMensual: updatedHistory }));
  };

  const isAssignedAdvisor = formData.asesorId === currentUser.id;
  const canEditPedido = canManageAll && (!isEditing || formData.estado === 'Pedido');
  const canEditAsignacion = canManageAll && !formData.clienteId;
  const canEditNegociacion = isAssignedAdvisor && ['En gestión', 'Pedido'].includes(formData.estado);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Canje' : 'Nuevo Pedido de Canje'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles del canje según su estado.' : 'Completa los datos para crear un nuevo pedido.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto pr-4">
          
          <fieldset disabled={!canEditPedido && isEditing} className="space-y-4 p-4 border rounded-md">
            <legend className="font-semibold px-1 text-primary">1. Pedido de Canje</legend>
            <div className="space-y-2">
              <Label htmlFor="titulo">Título del Canje</Label>
              <Input id="titulo" name="titulo" value={formData.titulo} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pedido">Detalle del Pedido</Label>
              <Textarea id="pedido" name="pedido" value={formData.pedido || ''} onChange={handleChange} />
            </div>
             <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo de Canje</Label>
                    <Select name="tipo" value={formData.tipo} onValueChange={(value: CanjeTipo) => handleSelectChange('tipo', value)}>
                      <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
                      <SelectContent>{canjeTipos.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>
          </fieldset>

          <fieldset disabled={!canEditAsignacion && isEditing} className="space-y-4 p-4 border rounded-md">
            <legend className="font-semibold px-1 text-primary">2. Asignación</legend>
             {!formData.clienteId ? ( 
                <div className="space-y-2">
                  <Label htmlFor="clienteId">Cliente</Label>
                  <Select value={formData.clienteId || ''} onValueChange={handleClientSelection}>
                    <SelectTrigger id="clienteId">
                      <SelectValue placeholder="Seleccionar cliente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Input value={formData.clienteName} disabled />
                </div>
              )}
            <div className="space-y-2">
              <Label>Asesor Asignado</Label>
              <Input value={formData.asesorName || 'Se asignará con el cliente'} disabled />
            </div>
          </fieldset>
          
          {formData.tipo === 'Una vez' && (
            <>
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
              
              <fieldset disabled={!canManageAll || formData.estado !== 'Culminado'} className="space-y-4 p-4 border rounded-md bg-muted/30">
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
                 <Button size="sm" onClick={() => handleSelectChange('estado', 'Aprobado')} disabled={formData.estado !== 'Culminado'}>
                    Marcar como Aprobado y Finalizado
                 </Button>
              </fieldset>
            </>
          )}
           
          {isEditing && formData.tipo === 'Mensual' && (
                <fieldset className="space-y-4 p-4 border rounded-md">
                    <legend className="font-semibold px-1 text-primary">3. Historial y Gestión Mensual</legend>
                    <div className="flex items-end gap-2">
                         <div className="flex-1 space-y-1">
                            <Label htmlFor="month-selector">Seleccionar Mes a Registrar</Label>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger id="month-selector">
                                    <SelectValue placeholder="Ej: Enero 2024" />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthOptions.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value} disabled={formData.historialMensual?.some(h => h.mes === opt.value)}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleRegisterMonth} disabled={!selectedMonth}>
                           Registrar Mes
                        </Button>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Mes</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Valor</TableHead>
                                    <TableHead>Culminación</TableHead>
                                    <TableHead className="w-12"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {formData.historialMensual && formData.historialMensual.length > 0 ? (
                                    formData.historialMensual.map(item => (
                                        <React.Fragment key={item.mes}>
                                            <TableRow>
                                                <TableCell className="font-medium capitalize">{format(parseISO(`${item.mes}-02`), 'MMMM yyyy', { locale: es })}</TableCell>
                                                <TableCell>
                                                    <Select 
                                                        value={item.estado}
                                                        onValueChange={(v: HistorialMensualEstado) => handleHistoryChange(item.mes, 'estado', v)}
                                                        disabled={!canManageAll}
                                                    >
                                                        <SelectTrigger className={cn("text-xs h-8",
                                                            item.estado === 'Pendiente' && 'bg-yellow-100 border-yellow-300',
                                                            item.estado === 'Aprobado' && 'bg-green-100 border-green-300',
                                                            item.estado === 'Rechazado' && 'bg-red-100 border-red-300',
                                                        )}><SelectValue/></SelectTrigger>
                                                        <SelectContent>{historialMensualEstados.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                </TableCell>
                                                 <TableCell>
                                                   ${(item.valorCanje || 0).toLocaleString('es-AR')}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {item.fechaCulminacion ? format(new Date(item.fechaCulminacion), "P", { locale: es }) : '-'}
                                                    {item.culminadoPorName && <p className="text-muted-foreground">por {item.culminadoPorName}</p>}
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingMonth(editingMonth === item.mes ? null : item.mes)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {editingMonth === item.mes && (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="p-0">
                                                        <div className="p-4 bg-muted/50 space-y-4">
                                                             <div className="grid grid-cols-2 gap-4">
                                                                <div className="space-y-2">
                                                                    <Label>Valor Canje (Mes)</Label>
                                                                    <Input type="number" value={item.valorCanje || ''} onChange={(e) => handleHistoryChange(item.mes, 'valorCanje', Number(e.target.value))} disabled={!isAssignedAdvisor}/>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label>Observaciones (Mes)</Label>
                                                                    <Textarea value={item.observaciones || ''} onChange={(e) => handleHistoryChange(item.mes, 'observaciones', e.target.value)} disabled={!isAssignedAdvisor} />
                                                                </div>
                                                             </div>
                                                             <div className="p-4 border rounded-md bg-background space-y-4">
                                                                <h4 className="font-semibold text-sm">Aprobación del Mes</h4>
                                                                <div className="grid grid-cols-2 gap-4">
                                                                    <div className="space-y-2">
                                                                        <Label>Fecha Culminación</Label>
                                                                        <Input type="date" value={item.fechaCulminacion?.split('T')[0] || ''} onChange={(e) => handleHistoryChange(item.mes, 'fechaCulminacion', e.target.value)} disabled={!canManageAll} />
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        <Label>Estado Final</Label>
                                                                        <Select value={item.estadoFinal || ''} onValueChange={(v) => handleHistoryChange(item.mes, 'estadoFinal', v)} disabled={!canManageAll}>
                                                                            <SelectTrigger><SelectValue/></SelectTrigger>
                                                                            <SelectContent>{canjeEstadoFinalOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    <Label>Comentario Final</Label>
                                                                    <Textarea value={item.comentarioFinal || ''} onChange={(e) => handleHistoryChange(item.mes, 'comentarioFinal', e.target.value)} disabled={!canManageAll} />
                                                                </div>
                                                                {canManageAll && <Button size="sm" onClick={() => { handleHistoryChange(item.mes, 'culminadoPorId', currentUser.id); handleHistoryChange(item.mes, 'culminadoPorName', currentUser.name); }}>Marcar como revisado</Button>}
                                                             </div>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-24">No hay registros mensuales.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </fieldset>
           )}

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
