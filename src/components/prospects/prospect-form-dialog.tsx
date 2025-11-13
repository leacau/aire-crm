

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
import type { Prospect, ProspectStatus, ClientActivity } from '@/lib/types';
import { prospectStatusOptions } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

type ProspectFormData = Omit<Prospect, 'id' | 'createdAt' | 'ownerId' | 'ownerName' | 'statusChangedAt'>;

interface ProspectFormDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (prospectData: ProspectFormData) => void;
  prospect?: Prospect | null;
  activities?: ClientActivity[];
  activitySectionRef?: React.RefObject<HTMLDivElement>;
}

const initialFormData: ProspectFormData = {
  companyName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  sector: '',
  notes: '',
  status: 'Nuevo',
};

export function ProspectFormDialog({
  isOpen,
  onOpenChange,
  onSave,
  prospect = null,
  activities = [],
  activitySectionRef,
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
          sector: prospect.sector || '',
          notes: prospect.notes || '',
          status: prospect.status,
        });
      } else {
        setFormData(initialFormData);
      }
      setIsSaving(false);
    }
  }, [prospect, isOpen]);

  useEffect(() => {
    // Scroll to activities if the ref is provided and the section is visible
    if (isOpen && activitySectionRef?.current) {
        setTimeout(() => {
            activitySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
  }, [isOpen, activitySectionRef]);


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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Prospecto' : 'Nuevo Prospecto'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Actualiza los detalles del prospecto.' : 'Rellena los datos para crear un nuevo prospecto.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Empresa</Label>
              <Input id="companyName" name="companyName" value={formData.companyName} onChange={handleChange} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="sector">Sector / Rubro</Label>
              <Input id="sector" name="sector" value={formData.sector || ''} onChange={handleChange} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contacto</Label>
              <Input id="contactName" name="contactName" value={formData.contactName || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Teléfono</Label>
              <Input id="contactPhone" name="contactPhone" value={formData.contactPhone || ''} onChange={handleChange} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input id="contactEmail" name="contactEmail" type="email" value={formData.contactEmail || ''} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={formData.status} onValueChange={(value: ProspectStatus) => setFormData(p => ({...p, status: value}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {filteredStatusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} />
          </div>

          {isEditing && (
             <div className="space-y-4 pt-4 border-t" ref={activitySectionRef}>
                <h4 className="font-semibold text-lg">Historial de Actividades</h4>
                {activities.length > 0 ? (
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {activities.map(activity => (
                            <div key={activity.id} className="text-sm p-2 bg-muted/50 rounded-md">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold">{activity.type} <span className="font-normal">por {activity.userName}</span></p>
                                    <p className="text-xs text-muted-foreground">{format(parseISO(activity.timestamp), 'PPP p', { locale: es })}</p>
                                </div>
                                <p className="text-muted-foreground mt-1">{activity.observation}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center">No hay actividades registradas para este prospecto.</p>
                )}
             </div>
          )}

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
