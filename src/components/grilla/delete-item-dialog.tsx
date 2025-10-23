
'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { CommercialItem } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DeleteItemDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  item: CommercialItem;
  onConfirmDelete: (item: CommercialItem, deleteMode: 'single' | 'forward' | 'all') => void;
}

export function DeleteItemDialog({ isOpen, onOpenChange, item, onConfirmDelete }: DeleteItemDialogProps) {
  const [deleteMode, setDeleteMode] = React.useState<'single' | 'forward' | 'all'>('single');

  const handleConfirm = () => {
    onConfirmDelete(item, deleteMode);
    onOpenChange(false); // Close the dialog after confirming
  };
  
  const formattedDate = format(new Date(item.date), "PPP", { locale: es });

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar Elemento Comercial?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar "{item.description}" del día <strong>{formattedDate}</strong>.
            {item.seriesId && ' Este elemento es parte de una serie.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {item.seriesId && (
            <div className="py-4">
                <Label className="font-semibold">Opciones de Eliminación</Label>
                <RadioGroup value={deleteMode} onValueChange={(value) => setDeleteMode(value as any)} className="mt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="single" id="delete-single" />
                        <Label htmlFor="delete-single" className="font-normal">Eliminar solo este día</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="forward" id="delete-forward" />
                        <Label htmlFor="delete-forward" className="font-normal">Eliminar este y todos los días futuros</Label>
                    </div>
                     <div className="flex items-center space-x-2">
                        <RadioGroupItem value="all" id="delete-all" />
                        <Label htmlFor="delete-all" className="font-normal">Eliminar toda la serie (pasado y futuro)</Label>
                    </div>
                </RadioGroup>
            </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button onClick={handleConfirm} variant="destructive">
            Eliminar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
