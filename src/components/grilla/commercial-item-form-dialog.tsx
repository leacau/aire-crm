
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CommercialItem, Program, Client, Opportunity } from '@/lib/types';
import { commercialItemTypes, commercialItemStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { getClients, getAllOpportunities } from '@/lib/firebase-service';
import { Calendar } from '../ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/hooks/use-auth';
import { Trash2 } from 'lucide-react';
import { Input } from '../ui/input';

interface CommercialItemFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (item: Omit<CommercialItem, 'id' | 'date'>, dates: Date[]) => void;
  onDelete: (item: CommercialItem) => void;
  item?: CommercialItem | null;
  programs: Program[];
  preselectedData?: { programId?: string, date?: Date } | null;
}

export function CommercialItemFormDialog({ isOpen, onOpenChange, onSave, onDelete, item, programs, preselectedData }: CommercialItemFormDialogProps) {
  const { userInfo, isBoss } = useAuth();
  const [programId, setProgramId] = useState<string | undefined>();
  const [type, setType] = useState<CommercialItem['type']>('Pauta');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bloque, setBloque] = useState('');
  const [status, setStatus] = useState<CommercialItem['status']>('Disponible');
  const [clientId, setClientId] = useState<string | undefined>();
  const [opportunityId, setOpportunityId] = useState<string | undefined>();
  
  const [dates, setDates] = useState<Date[] | undefined>();

  const [allClients, setAllClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  
  const { toast } = useToast();
  const isEditing = !!item;
  const canManage = isBoss || userInfo?.role === 'Administracion' || userInfo?.role === 'Gerencia';

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        getClients(),
        getAllOpportunities()
      ]).then(([clients, opps]) => {
        setAllClients(clients);
        setOpportunities(opps);
      }).catch(err => console.error("Failed to fetch data", err));
      
      if (isEditing && item) {
        setProgramId(item.programId);
        setType(item.type);
        setTitle(item.title || '');
        setDescription(item.description);
        setBloque(item.bloque || '');
        setStatus(item.status);
        setClientId(item.clientId);
        setOpportunityId(item.opportunityId);
        setDates([new Date(item.date)]);
      } else {
        setProgramId(preselectedData?.programId);
        setType('Pauta');
        setTitle('');
        setDescription('');
        setBloque('');
        setStatus('Disponible');
        setClientId(undefined);
        setOpportunityId(undefined);
        setDates(preselectedData?.date ? [preselectedData.date] : undefined);
      }
    }
  }, [isOpen, item, isEditing, preselectedData]);
  
  const filteredClients = useMemo(() => {
    if (!userInfo) return [];
    if (canManage) return allClients;
    return allClients.filter(c => c.ownerId === userInfo.id);
  }, [allClients, canManage, userInfo]);
  
  const clientOpportunities = clientId ? opportunities.filter(opp => opp.clientId === clientId) : [];

  const handleSave = () => {
    if (!programId || !description.trim() || !dates || dates.length === 0) {
      toast({ title: 'Campos obligatorios', description: 'Programa, descripción y al menos una fecha son requeridos.', variant: 'destructive' });
      return;
    }
    const clientName = allClients.find(c => c.id === clientId)?.denominacion;
    const opportunityTitle = opportunities.find(o => o.id === opportunityId)?.title;
    
    onSave({ programId, type, title, description, bloque, status, clientId, clientName, opportunityId, opportunityTitle }, dates);
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (item) {
      onDelete(item);
    }
  };
  
  const showAssignmentFields = status !== 'Disponible';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar' : 'Nuevo'} Elemento Comercial</DialogTitle>
          <DialogDescription>
            {isEditing 
                ? 'Modifica el estado y los detalles del elemento comercial.'
                : 'Añade un nuevo espacio comercial a la grilla para uno o varios días.'
            }
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="space-y-2">
            <Label htmlFor="programId">Programa</Label>
             <Select value={programId} onValueChange={setProgramId} disabled={isEditing}>
                <SelectTrigger id="programId"><SelectValue placeholder="Seleccionar programa..." /></SelectTrigger>
                <SelectContent>
                  {programs.sort((a,b) => a.name.localeCompare(b.name)).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
          </div>
          <div className="space-y-2">
            <Label>Fechas de Emisión</Label>
             <Calendar
                mode="multiple"
                selected={dates}
                onSelect={setDates}
                locale={es}
                className="rounded-md border"
            />
            <p className="text-sm text-muted-foreground">
                {dates?.length ? `${dates.length} día(s) seleccionado(s).` : 'Selecciona una o más fechas.'}
            </p>
          </div>

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
          
          {type === 'PNT' && (
            <div className="space-y-2">
              <Label htmlFor="item-title">Título del PNT</Label>
              <Input id="item-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título para identificación rápida"/>
            </div>
          )}

          {type === 'Auspicio' && (
             <div className="space-y-2">
              <Label htmlFor="item-bloque">Bloque / Sección</Label>
              <Input id="item-bloque" value={bloque} onChange={e => setBloque(e.target.value)} placeholder="Ej: Deportes, Clima, Política..."/>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="item-description">Descripción / Anunciante / Texto</Label>
            <Textarea id="item-description" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {showAssignmentFields && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-client">Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger id="item-client"><SelectValue placeholder="Asignar cliente..." /></SelectTrigger>
                    <SelectContent>
                      {filteredClients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="item-opportunity">Oportunidad</Label>
                  <Select value={opportunityId} onValueChange={setOpportunityId} disabled={!clientId}>
                    <SelectTrigger id="item-opportunity"><SelectValue placeholder="Asignar oportunidad..." /></SelectTrigger>
                    <SelectContent>
                      {clientOpportunities.map(o => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <div>
            {isEditing && canManage && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Guardar Cambios</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
