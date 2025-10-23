
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Program, CommercialItem } from '@/lib/types';
import { getPrograms, getCommercialItems, updateCommercialItem, createCommercialItem } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { format, startOfToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { PlusCircle } from 'lucide-react';

interface PntItemProps {
  item: CommercialItem;
  onToggleRead: (item: CommercialItem, isRead: boolean) => void;
}

const PntItem: React.FC<PntItemProps> = ({ item, onToggleRead }) => {
  const isRead = !!item.pntRead;
  
  return (
    <div 
      className={cn(
        "flex items-start space-x-4 p-3 rounded-lg border",
        isRead ? "bg-muted/50" : "bg-background"
      )}
    >
      <Checkbox
        id={`pnt-${item.id}`}
        checked={isRead}
        onCheckedChange={(checked) => onToggleRead(item, !!checked)}
        className="mt-1"
      />
      <div className="flex-1 space-y-1">
        <Label 
          htmlFor={`pnt-${item.id}`}
          className={cn(
            "font-semibold text-base leading-none",
            isRead && "line-through text-muted-foreground"
          )}
        >
          {item.description}
        </Label>
        <p className={cn("text-sm", isRead && "text-muted-foreground")}>
          {item.opportunityTitle || 'PNT Genérico'}
        </p>
        {isRead && item.pntReadAt && (
          <p className="text-xs text-muted-foreground pt-1">
            Leído a las {format(new Date(item.pntReadAt), 'HH:mm:ss', { locale: es })} hs
          </p>
        )}
      </div>
    </div>
  );
};

const AddPntForm = ({ programId, onPntAdded }: { programId: string, onPntAdded: () => void }) => {
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { userInfo } = useAuth();
    const { toast } = useToast();

    const handleAddPnt = async () => {
        if (!description.trim() || !userInfo) {
            toast({ title: 'La descripción no puede estar vacía.', variant: 'destructive' });
            return;
        }
        setIsSaving(true);
        try {
            const newItem: Omit<CommercialItem, 'id'> = {
                programId,
                date: format(new Date(), 'yyyy-MM-dd'),
                type: 'PNT',
                description,
                status: 'Vendido', // PNTs are considered sold by default
                createdBy: userInfo.id
            };
            await createCommercialItem(newItem);
            setDescription('');
            onPntAdded(); // Callback to refresh the list
            toast({ title: 'PNT añadido correctamente' });
        } catch (error) {
            console.error("Error adding PNT:", error);
            toast({ title: 'Error al añadir PNT', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-2 mt-4 p-3 border-t">
            <Input 
                placeholder="Añadir nuevo PNT..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter') handleAddPnt() }}
                disabled={isSaving}
            />
            <Button onClick={handleAddPnt} disabled={isSaving}>
                {isSaving ? <Spinner size="small" /> : <PlusCircle className="h-4 w-4" />}
                <span className="sr-only">Añadir PNT</span>
            </Button>
        </div>
    );
};


export default function PntsPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [programs, setPrograms] = useState<Program[]>([]);
  const [pnts, setPnts] = useState<CommercialItem[]>([]);
  const [loading, setLoading] = useState(true);

  const today = startOfToday();
  const formattedDate = format(today, 'yyyy-MM-dd');
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedPrograms, fetchedItems] = await Promise.all([
        getPrograms(),
        getCommercialItems(formattedDate),
      ]);
      
      setPrograms(fetchedPrograms);
      setPnts(fetchedItems.filter(item => item.type === 'PNT'));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error al cargar los PNTs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [formattedDate, toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  const handleToggleRead = async (item: CommercialItem, isRead: boolean) => {
    const originalPnts = [...pnts];
    
    // Optimistic UI update
    setPnts(prev => prev.map(p => 
      p.id === item.id 
        ? { ...p, pntRead: isRead, pntReadAt: isRead ? new Date().toISOString() : undefined }
        : p
    ));

    try {
      const updateData: Partial<CommercialItem> = {
        pntRead: isRead,
        pntReadAt: isRead ? new Date().toISOString() : undefined,
      };
      await updateCommercialItem(item.id, updateData);
    } catch (error) {
      console.error("Error updating PNT status:", error);
      toast({ title: "Error al actualizar el PNT", variant: "destructive" });
      // Revert optimistic update on error
      setPnts(originalPnts);
    }
  };

  const programsForToday = useMemo(() => {
    return programs
      .map(program => {
        const scheduleForDay = program.schedules.find(s => s.daysOfWeek.includes(dayOfWeek));
        if (!scheduleForDay) return null;
        
        const programPnts = pnts.filter(pnt => pnt.programId === program.id);

        return {
          ...program,
          schedule: scheduleForDay,
          pnts: programPnts,
        };
      })
      .filter((p): p is Program & { schedule: NonNullable<Program['schedules'][0]>, pnts: CommercialItem[] } => p !== null)
      .sort((a, b) => a!.schedule.startTime.localeCompare(b!.schedule.startTime));
  }, [programs, pnts, dayOfWeek]);


  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={`PNTs - ${format(today, 'PPPP', { locale: es })}`} />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        {programsForToday.length > 0 ? (
            <Accordion type="multiple" className="w-full space-y-4">
                {programsForToday.map(program => (
                    <AccordionItem value={program.id} key={program.id} className="border-b-0">
                        <AccordionTrigger className={cn("flex rounded-lg border p-4 text-left hover:no-underline", program.color)}>
                            <div className="flex-1">
                                <h3 className="font-bold text-lg">{program.name}</h3>
                                <p className="font-normal text-sm">({program.schedule.startTime} - {program.schedule.endTime})</p>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-0">
                            <div className="border border-t-0 rounded-b-lg">
                                <div className="p-4 space-y-3">
                                {program.pnts.length > 0 ? (
                                    program.pnts.map(pnt => (
                                      <PntItem key={pnt.id} item={pnt} onToggleRead={handleToggleRead} />
                                    ))
                                ) : (
                                    <p className="text-center text-sm text-muted-foreground py-4">No hay PNTs registrados para este programa.</p>
                                )}
                                </div>
                                <AddPntForm programId={program.id} onPntAdded={fetchData} />
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 border-2 border-dashed rounded-lg">
             <h3 className="text-xl font-semibold">No hay programas para hoy</h3>
             <p className="text-muted-foreground mt-2">La grilla de programas para el día de hoy está vacía.</p>
          </div>
        )}
      </main>
    </div>
  );
}
