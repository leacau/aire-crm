
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
import { Badge } from '@/components/ui/badge';
import type { CommercialItem } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface PautaDetailsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pauta: CommercialItem;
  onToggleRead: (item: CommercialItem, isRead: boolean) => void;
}

export function PautaDetailsDialog({ isOpen, onOpenChange, pauta, onToggleRead }: PautaDetailsDialogProps) {

  const handleMarkAsRead = () => {
    onToggleRead(pauta, !pauta.pntRead);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pauta.title}</DialogTitle>
          <DialogDescription>
            <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary">{pauta.type}</Badge>
                {pauta.bloque && <Badge variant="outline">Sección: {pauta.bloque}</Badge>}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
            <div className="space-y-1">
                <h4 className="font-semibold">Texto a leer</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">{pauta.description}</p>
            </div>
            {pauta.clientName && (
                <div className="space-y-1">
                    <h4 className="font-semibold">Cliente</h4>
                    <Link href={`/clients/${pauta.clientId}`} className="text-primary hover:underline">
                        {pauta.clientName}
                    </Link>
                </div>
            )}
            {pauta.pntRead && pauta.pntReadAt && (
                <p className="text-sm text-green-600 font-medium">
                    Leído a las {format(new Date(pauta.pntReadAt), 'HH:mm:ss', { locale: es })} hs
                </p>
            )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={handleMarkAsRead}>
            {pauta.pntRead ? 'Marcar como No Leído' : 'Marcar como Leído'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
