
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface NotificacionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  managers: User[];
  onConfirm: (emails: string[]) => void;
}

export function NotificacionDialog({
  isOpen,
  onOpenChange,
  managers,
  onConfirm,
}: NotificacionDialogProps) {
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const { toast } = useToast();

  const handleConfirm = () => {
    if (selectedManagerIds.length === 0) {
      toast({
        title: 'Ningún destinatario seleccionado',
        description: 'Por favor, selecciona al menos un destinatario para la notificación.',
        variant: 'destructive',
      });
      return;
    }
    const selectedEmails = managers
      .filter(m => selectedManagerIds.includes(m.id) && m.email)
      .map(m => m.email);
    
    onConfirm(selectedEmails);
    onOpenChange(false);
  };
  
  const handleCheckboxChange = (managerId: string, checked: boolean | 'indeterminate') => {
      setSelectedManagerIds(prev => 
        checked ? [...prev, managerId] : prev.filter(id => id !== managerId)
      )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notificar para Aprobación</DialogTitle>
          <DialogDescription>
            El canje ha sido marcado como "Completo". Selecciona a quién notificar por correo electrónico para que lo aprueben.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
            <Label className="font-semibold">Destinatarios</Label>
            <div className="space-y-2 max-h-60 overflow-y-auto rounded-md border p-2">
                {managers.map(manager => (
                    <div key={manager.id} className="flex items-center space-x-2">
                        <Checkbox 
                            id={`manager-${manager.id}`}
                            onCheckedChange={(checked) => handleCheckboxChange(manager.id, checked)}
                            checked={selectedManagerIds.includes(manager.id)}
                        />
                        <Label htmlFor={`manager-${manager.id}`} className="font-normal w-full">
                           <div>{manager.name} <span className="text-muted-foreground text-xs">({manager.role})</span></div>
                           <div className="text-muted-foreground text-xs">{manager.email}</div>
                        </Label>
                    </div>
                ))}
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm}>Enviar Notificación</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
