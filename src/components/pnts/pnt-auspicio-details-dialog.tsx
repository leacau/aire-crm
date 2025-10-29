
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
import type { CommercialItem } from '@/lib/types';
import { CheckCircle, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

  const [fontSize, setFontSize] = useState(2); // 0:sm, 1:base, 2:lg, 3:xl, 4:2xl

  const handleToggleRead = () => {
    onToggleRead(item, !item.pntRead);
    onOpenChange(false);
  };
  
  const handleDelete = () => {
    if (onDelete) {
      onDelete(item);
      // Let the parent component handle closing the dialogs
    }
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (direction === 'in') {
      setFontSize(prev => Math.min(prev + 1, 4));
    } else {
      setFontSize(prev => Math.max(prev - 1, 0));
    }
  };

  const sizeClasses = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'];
  const displayTitle = item.type === 'Auspicio' && item.bloque ? `${item.bloque} - ${item.title}` : item.title;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="h-[95vh] w-[95vw] sm:h-[80vh] sm:w-[80vw] max-w-[95vw] sm:max-w-[80vw] flex flex-col">
        <DialogHeader>
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <DialogTitle>{displayTitle}</DialogTitle>
                    <DialogDescription>
                        {item.type} para el programa. {item.clientName && `Cliente: ${item.clientName}`}
                    </DialogDescription>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleZoom('out')} disabled={fontSize === 0}>
                        <ZoomOut className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleZoom('in')} disabled={fontSize === 4}>
                        <ZoomIn className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </DialogHeader>
        <div className="flex-1 grid gap-4 py-4 overflow-y-auto pr-4">
          
          {item.type === 'Auspicio' && item.bloque && (
            <div className="space-y-1">
              <Label className="font-semibold text-primary">Sección / Bloque</Label>
              <p className="text-base p-2 bg-muted rounded-md">{item.bloque}</p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="font-semibold text-primary">Texto a leer</Label>
            <div className="p-3 bg-muted rounded-md min-h-[150px]">
                <p className={cn("whitespace-pre-wrap transition-all", sizeClasses[fontSize])}>
                    {item.description}
                </p>
            </div>
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
