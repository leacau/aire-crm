
'use client';

import React, { useState, useEffect } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '../ui/spinner';
import type { User } from '@/lib/types';
import { saveMonthlyClosure } from '@/lib/firebase-service';
import { useAuth } from '@/hooks/use-auth';
import { format, getYear, getMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface MonthlyClosureDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  advisors: User[];
  onSaveSuccess: () => void;
}

const generateMonthOptions = () => {
    const options: { label: string, value: string }[] = [];
    const today = new Date();
    for (let i = 1; i <= 24; i++) { // Go back 24 months
        const date = subMonths(today, i);
        const year = getYear(date);
        const month = getMonth(date) + 1;
        const value = `${year}-${String(month).padStart(2, '0')}`;
        const label = format(date, "MMMM yyyy", { locale: es });
        options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return options;
};
const monthOptions = generateMonthOptions();

export function MonthlyClosureDialog({
  isOpen,
  onOpenChange,
  advisors,
  onSaveSuccess
}: MonthlyClosureDialogProps) {
  const { userInfo } = useAuth();
  const { toast } = useToast();
  const [selectedAdvisorId, setSelectedAdvisorId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [closureValue, setClosureValue] = useState<number | string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
        setSelectedAdvisorId('');
        setSelectedMonth('');
        setClosureValue('');
        setIsSaving(false);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!selectedAdvisorId || !selectedMonth || !closureValue) {
        toast({ title: 'Datos incompletos', description: 'Por favor, selecciona un asesor, un mes y un valor.', variant: 'destructive'});
        return;
    }

    if (!userInfo) return;

    setIsSaving(true);
    try {
        await saveMonthlyClosure(selectedAdvisorId, selectedMonth, Number(closureValue), userInfo.id);
        toast({ title: 'Cierre Mensual Guardado', description: `Se ha registrado el cierre para el mes ${selectedMonth}.`});
        onSaveSuccess();
        onOpenChange(false);
    } catch (error) {
        console.error("Error saving monthly closure:", error);
        toast({ title: 'Error al guardar', description: (error as Error).message, variant: 'destructive'});
    } finally {
        setIsSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gestionar Cierres Mensuales</DialogTitle>
          <DialogDescription>
            Registra el valor de facturación final para un asesor en un mes determinado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label htmlFor="advisor-select">Asesor</Label>
                <Select value={selectedAdvisorId} onValueChange={setSelectedAdvisorId}>
                    <SelectTrigger id="advisor-select">
                        <SelectValue placeholder="Seleccionar asesor..." />
                    </SelectTrigger>
                    <SelectContent>
                        {advisors.map(adv => (
                            <SelectItem key={adv.id} value={adv.id}>{adv.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="month-select">Mes a Cerrar</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger id="month-select">
                        <SelectValue placeholder="Seleccionar mes..." />
                    </SelectTrigger>
                    <SelectContent>
                        {monthOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label htmlFor="closure-value">Valor de Facturación Final</Label>
                <Input
                    id="closure-value"
                    type="number"
                    value={closureValue}
                    onChange={(e) => setClosureValue(e.target.value)}
                    placeholder="Ej: 150000"
                />
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="small" /> : 'Guardar Cierre'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
