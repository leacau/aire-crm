
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Program, CommercialItem, Client, CommercialItemType } from '@/lib/types';
import { getPrograms, getCommercialItems, updateCommercialItem, createCommercialItem, getClients } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { format, startOfToday, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { PlusCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PautaDetailsDialog } from '@/components/pauta/pauta-details-dialog';

interface AddPautaFormProps {
  programId: string;
  onPautaAdded: () => void;
}

const AddPautaForm: React.FC<AddPautaFormProps> = ({ programId, onPautaAdded }) => {
    const [type, setType] = useState<CommercialItemType>('PNT');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [bloque, setBloque] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string | undefined>();
    const [clients, setClients] = useState<Client[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { userInfo } = useAuth();
    const { toast } = useToast();

    useEffect(() => {
        getClients().then(setClients);
    }, []);

    const handleAddPauta = async () => {
        if (!title.trim() || !description.trim() || !userInfo) {
            toast({ title: 'Título y texto son obligatorios.', variant: 'destructive' });
            return;
        }
        setIsSaving(true);
        try {
            const selectedClient = clients.find(c => c.id === selectedClientId);

            const newItem: Omit<CommercialItem, 'id'> = {
                programId,
                date: format(new Date(), 'yyyy-MM-dd'),
                type,
                title,
                description,
                bloque: type === 'Auspicio' ? bloque : undefined,
                status: 'Vendido',
                createdBy: userInfo.id,
                clientId: selectedClient?.id,
                clientName: selectedClient?.denominacion
            };
            await createCommercialItem(newItem);
            
            // Reset form
            setTitle('');
            setDescription('');
            setBloque('');
            setSelectedClientId(undefined);
            
            onPautaAdded(); 
            toast({ title: `${type} añadido correctamente` });
        } catch (error) {
            console.error(`Error adding ${type}:`, error);
            toast({ title: `Error al añadir ${type}`, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 mt-4 p-3 border-t">
            <Select value={type} onValueChange={(v: CommercialItemType) => setType(v)}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                    <SelectItem value="PNT">Añadir PNT</SelectItem>
                    <SelectItem value="Auspicio">Añadir Auspicio</SelectItem>
                </SelectContent>
            </Select>

            <Input 
                placeholder="Título (para identificación rápida)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
            />
            {type === 'Auspicio' && (
                 <Input 
                    placeholder="Sección / Bloque (Ej: Deportes)"
                    value={bloque}
                    onChange={(e) => setBloque(e.target.value)}
                    disabled={isSaving}
                />
            )}
            <Textarea 
                placeholder="Texto a leer..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
                rows={3}
            />
            <div className="flex items-center gap-2">
                 <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Cliente (Opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Ninguno</SelectItem>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.denominacion}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button onClick={handleAddPauta} disabled={isSaving || !title.trim() || !description.trim()} size="icon">
                    {isSaving ? <Spinner size="small" /> : <PlusCircle className="h-4 w-4" />}
                    <span className="sr-only">Añadir</span>
                </Button>
            </div>
        </div>
    );
};


export default function PntsPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [currentDate, setCurrentDate] = useState(startOfToday());
  const [programs, setPrograms] = useState<Program[]>([]);
  const [pautas, setPautas] = useState<CommercialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPauta, setSelectedPauta] = useState<CommercialItem | null>(null);

  const formattedDate = format(currentDate, 'yyyy-MM-dd');
  const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedPrograms, fetchedItems] = await Promise.all([
        getPrograms(),
        getCommercialItems(formattedDate),
      ]);
      
      setPrograms(fetchedPrograms);
      setPautas(fetchedItems.filter(item => item.type === 'PNT' || item.type === 'Auspicio'));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error al cargar las pautas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [formattedDate, toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData, currentDate]);

  const handleToggleRead = async (item: CommercialItem, isRead: boolean) => {
    const originalPautas = [...pautas];
    
    setPautas(prev => prev.map(p => 
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
      setSelectedPauta(null);
    } catch (error) {
      console.error("Error updating Pauta status:", error);
      toast({ title: "Error al actualizar la pauta", variant: "destructive" });
      setPautas(originalPautas);
    }
  };
  
  const handleDateChange = (direction: 'prev' | 'next') => {
      setCurrentDate(prev => direction === 'next' ? addDays(prev, 1) : subDays(prev, 1));
  }

  const programsForToday = useMemo(() => {
    return programs
      .map(program => {
        const scheduleForDay = program.schedules.find(s => s.daysOfWeek.includes(dayOfWeek));
        if (!scheduleForDay) return null;
        
        const programPautas = pautas.filter(pnt => pnt.programId === program.id)
          .sort((a, b) => {
              if (a.pntRead && !b.pntRead) return 1;
              if (!a.pntRead && b.pntRead) return -1;
              if (a.pntRead && b.pntRead) {
                return new Date(a.pntReadAt!).getTime() - new Date(b.pntReadAt!).getTime();
              }
              return 0;
          });

        return {
          ...program,
          schedule: scheduleForDay,
          pautas: programPautas,
        };
      })
      .filter((p): p is Program & { schedule: NonNullable<Program['schedules'][0]>, pautas: CommercialItem[] } => p !== null)
      .sort((a, b) => a!.schedule.startTime.localeCompare(b!.schedule.startTime));
  }, [programs, pautas, dayOfWeek]);


  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Pauta Diaria">
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => handleDateChange('prev')}><ArrowLeft className="mr-2 h-4 w-4"/> Anterior</Button>
                <span className="font-semibold text-lg capitalize w-48 text-center">{format(currentDate, 'PPPP', { locale: es })}</span>
                <Button variant="outline" onClick={() => handleDateChange('next')}>Siguiente <ArrowRight className="ml-2 h-4 w-4"/></Button>
            </div>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {programsForToday.length > 0 ? (
              <Accordion type="multiple" className="w-full space-y-4" defaultValue={programsForToday.map(p => p.id)}>
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
                                  {program.pautas.length > 0 ? (
                                      program.pautas.map(pauta => (
                                        <div 
                                          key={pauta.id}
                                          className={cn("flex items-center space-x-4 p-3 rounded-lg border cursor-pointer hover:bg-muted", pauta.pntRead ? "bg-muted/50" : "bg-background")}
                                          onClick={() => setSelectedPauta(pauta)}
                                        >
                                          <div className="flex-1 space-y-1">
                                              <p className={cn("font-semibold", pauta.pntRead && "line-through text-muted-foreground")}>{pauta.title}</p>
                                              <p className={cn("text-xs text-muted-foreground", pauta.pntRead && "line-through")}>{pauta.type}</p>
                                          </div>
                                          {pauta.pntRead && <span className="text-xs text-muted-foreground">Leído</span>}
                                        </div>
                                      ))
                                  ) : (
                                      <p className="text-center text-sm text-muted-foreground py-4">No hay pautas registradas para este programa.</p>
                                  )}
                                  </div>
                                  <AddPautaForm programId={program.id} onPautaAdded={fetchData} />
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
      {selectedPauta && (
        <PautaDetailsDialog
            isOpen={!!selectedPauta}
            onOpenChange={() => setSelectedPauta(null)}
            pauta={selectedPauta}
            onToggleRead={handleToggleRead}
        />
      )}
    </>
  );
}
