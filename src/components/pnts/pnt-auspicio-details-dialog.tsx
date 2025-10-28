
'use client';

import React from 'react';
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
import type { CommercialItem } from '@/lib/types';
import { CheckCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PntAuspicioDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  item: CommercialItem;
  onToggleRead: (item: CommercialItem, isRead: boolean) => void;
  onDelete?: (item: CommercialItem) => void;
}

export function PntAuspicioDetailsDialog({
  isOpen,
  onOpenChange,
  item,
  onToggleRead,
  onDelete,
}: PntAuspicioDetailsDialogProps) {

  const handleToggleRead = () => {
    onToggleRead(item, !item.pntRead);
    onOpenChange(false);
  };
  
  const handleDelete = () => {
    if (onDelete) {
      onDelete(item);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>
            {item.type} para el programa. {item.clientName && `Cliente: ${item.clientName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          
          {item.bloque && (
            <div className="space-y-1">
              <Label className="font-semibold text-primary">Sección / Bloque</Label>
              <p className="text-base p-2 bg-muted rounded-md">{item.bloque}</p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="font-semibold text-primary">Texto a leer</Label>
            <p className="text-base whitespace-pre-wrap p-3 bg-muted rounded-md min-h-[150px]">
              {item.description}
            </p>
          </div>

          {item.pntRead && item.pntReadAt && (
             <div className="flex items-center gap-2 text-sm text-green-600 font-medium p-2 bg-green-50 border border-green-200 rounded-md">
                <CheckCircle className="h-5 w-5" />
                <span>Leído a las {format(new Date(item.pntReadAt), 'HH:mm:ss', { locale: es })} hs</span>
             </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <div>
            {onDelete && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4"/>
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button onClick={handleToggleRead}>
              {item.pntRead ? 'Marcar como No Leído' : 'Marcar como Leído'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
