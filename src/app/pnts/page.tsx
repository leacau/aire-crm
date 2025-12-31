
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import type { Program, CommercialItem, Client } from '@/lib/types';
import { getPrograms, getCommercialItems, updateCommercialItem, createCommercialItem, getClients, deleteCommercialItem, getCommercialItemsBySeries } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { format, startOfToday, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CheckCircle, PlusCircle, ArrowLeft, ArrowRight, Mic, Star, FileText, InfoIcon, ChevronDown, Group } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PntAuspicioFormDialog } from '@/components/pnts/pnt-auspicio-form-dialog';
import { PntAuspicioDetailsDialog } from '@/components/pnts/pnt-auspicio-details-dialog';
import { DeleteItemDialog } from '@/components/grilla/delete-item-dialog';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PntViewByProgram } from '@/components/pnts/pnt-view-by-program';
import { hasPermission } from '@/lib/permissions';


interface PntItemRowProps {
  item: CommercialItem;
  onClick: (item: CommercialItem) => void;
}

const PntItemRow: React.FC<PntItemRowProps> = ({ item, onClick }) => {
  const isRead = !!item.pntRead;
  let Icon = Mic;
  if (item.type === 'Auspicio') Icon = Star;
  if (item.type === 'Nota') Icon = FileText;

  return (
    <div 
      className={cn(
        "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/80",
        isRead ? "bg-muted/50 text-muted-foreground" : "bg-background"
      )}
      onClick={() => onClick(item)}
    >
      <div className='flex items-center gap-2 flex-1 min-w-0'>
        {isRead && <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />}
        {!isRead && <Icon className="h-5 w-5 text-primary flex-shrink-0" />}
        <div className="flex-1 space-y-1 overflow-hidden">
          <p className={cn("font-semibold leading-none truncate", isRead && "line-through")}>
              {item.title || item.description}
          </p>
          <div className="flex items-center gap-4 text-xs">
            <p>{item.type}</p>
            {item.clientName && <p className="text-muted-foreground truncate">Cliente: {item.clientName}</p>}
          </div>
        </div>
      </div>
       {isRead && item.pntReadAt && (
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          {format(new Date(item.pntReadAt), 'HH:mm')}hs
        </p>
      )}
    </div>
  );
};

export default function PntsPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [currentDate, setCurrentDate] = useState(startOfToday());
  const [programs, setPrograms] = useState<Program[]>([]);
  const [pnts, setPnts] = useState<CommercialItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CommercialItem | null>(null);
  const [isDeleteItemDialogOpen, setIsDeleteItemDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<CommercialItem | null>(null);

  const dayOfWeek = useMemo(() => currentDate.getDay() === 0 ? 7 : currentDate.getDay(), [currentDate]);
  const canManage = userInfo ? hasPermission(userInfo, 'PNTs', 'edit') : false;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const formattedDate = format(currentDate, 'yyyy-MM-dd');
    try {
      const [fetchedPrograms, fetchedItems, fetchedClients] = await Promise.all([
        getPrograms(),
        getCommercialItems(formattedDate),
        getClients(),
      ]);
      
      setPrograms(fetchedPrograms);
      setPnts(fetchedItems.filter(item => ['PNT', 'Auspicio', 'Nota'].includes(item.type)));
      setClients(fetchedClients);

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error al cargar los datos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentDate, toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  const handleItemSave = async (itemData: Omit<CommercialItem, 'id' | 'date'>) => {
    if (!userInfo || !selectedProgramId) return;

    try {
        const newItem: Omit<CommercialItem, 'id'> = {
            ...itemData,
            programId: selectedProgramId,
            date: format(currentDate, 'yyyy-MM-dd'),
            status: 'Vendido',
            createdBy: userInfo.id,
        };
        await createCommercialItem(newItem, userInfo.id, userInfo.name);
        fetchData();
        toast({ title: `${itemData.type} añadido correctamente` });
    } catch(error) {
        console.error("Error saving item:", error);
        toast({ title: `Error al añadir ${itemData.type}`, variant: "destructive" });
    }
  };

  const handleToggleRead = async (item: CommercialItem, isRead: boolean) => {
    const originalPnts = [...pnts];
    
    // Optimistic UI update
    setPnts(prev => prev.map(p => 
      p.id === item.id 
        ? { ...p, pntRead: isRead, pntReadAt: isRead ? new Date().toISOString() : undefined }
        : p
    ));
    setSelectedItem(prev => prev ? { ...prev, pntRead: isRead, pntReadAt: isRead ? new Date().toISOString() : undefined } : null);

    try {
      if (!userInfo) throw new Error("Usuario no autenticado");
      await updateCommercialItem(item.id, {
        pntRead: isRead,
        pntReadAt: isRead ? new Date().toISOString() : undefined,
        updatedBy: userInfo.id,
        updatedAt: new Date().toISOString(),
      }, userInfo.id, userInfo.name);
    } catch (error) {
      console.error("Error updating PNT status:", error);
      toast({ title: "Error al actualizar estado", variant: "destructive", description: (error as Error).message });
      setPnts(originalPnts);
      setSelectedItem(item);
    }
  };

  const handleDeleteItem = async (item: CommercialItem, deleteMode: 'single' | 'forward' | 'all') => {
    if (!canManage || !userInfo) return;

    try {
        let idsToDelete: string[] = [];
        if (deleteMode === 'single' || !item.seriesId) {
            idsToDelete.push(item.id);
        } else {
            const seriesItems = await getCommercialItemsBySeries(item.seriesId);
            if (deleteMode === 'all') {
                idsToDelete = seriesItems.map(i => i.id);
            } else { // 'forward'
                idsToDelete = seriesItems
                    .filter(i => new Date(i.date) >= new Date(item.date))
                    .map(i => i.id);
            }
        }
        
        await deleteCommercialItem(idsToDelete, userInfo.id, userInfo.name);
        
        toast({ title: `Se eliminaron ${idsToDelete.length} elemento(s)` });
        
        setIsDeleteItemDialogOpen(false);
        setItemToDelete(null);
        fetchData();
      } catch (error) {
          console.error("Error deleting commercial item(s):", error);
          toast({ title: 'Error al eliminar el elemento', variant: 'destructive' });
      }
  };
  
  const openDeleteItemDialog = (item: CommercialItem) => {
    setItemToDelete(item);
    setIsDetailsOpen(false); // Close details dialog when delete dialog opens
    setIsDeleteItemDialogOpen(true);
  };


  const programsForToday = useMemo(() => {
    return programs
      .map(program => {
        const scheduleForDay = program.schedules.find(s => s.daysOfWeek.includes(dayOfWeek));
        if (!scheduleForDay) return null;
        
        const programPnts = pnts.filter(pnt => pnt.programId === program.id)
          .sort((a, b) => {
              if (a.pntRead && !b.pntRead) return 1;
              if (!a.pntRead && b.pntRead) return -1;
              if (a.pntRead && b.pntRead && a.pntReadAt && b.pntReadAt) {
                return new Date(a.pntReadAt).getTime() - new Date(b.pntReadAt).getTime();
              }
              return 0;
          });
        
        const auspicios = programPnts.filter(item => item.type === 'Auspicio');
        const notas = programPnts.filter(item => item.type === 'Nota');
        const otrosPnts = programPnts.filter(item => item.type === 'PNT');

        const auspiciosPorBloque = auspicios.reduce((acc, item) => {
            const bloque = item.bloque || 'General';
            if (!acc[bloque]) acc[bloque] = [];
            acc[bloque].push(item);
            return acc;
        }, {} as Record<string, CommercialItem[]>);


        return {
          ...program,
          schedule: scheduleForDay,
          pnts: otrosPnts,
          notas: notas,
          auspicios: auspiciosPorBloque,
        };
      })
      .filter((p): p is Program & { schedule: NonNullable<Program['schedules'][0]>, pnts: CommercialItem[], notas: CommercialItem[], auspicios: Record<string, CommercialItem[]> } => p !== null)
      .sort((a, b) => a!.schedule.startTime.localeCompare(b!.schedule.startTime));
  }, [programs, pnts, dayOfWeek]);


  const navigateDay = (direction: 'next' | 'prev') => {
    const amount = direction === 'next' ? 1 : -1;
    setCurrentDate(prev => addDays(prev, amount));
  };
  
  const openFormModal = (progId: string) => {
    setSelectedProgramId(progId);
    setIsFormOpen(true);
  };
  
  const openDetailsModal = (item: CommercialItem) => {
    setSelectedItem(item);
    setIsDetailsOpen(true);
  };


  if (authLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        <Header title={`Pauta del Día - ${format(currentDate, 'PPPP', { locale: es })}`}>
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => navigateDay('prev')}><ArrowLeft className="h-4 w-4" /></Button>
                <Button variant="outline" onClick={() => setCurrentDate(startOfToday())}>Hoy</Button>
                <Button variant="outline" size="icon" onClick={() => navigateDay('next')}><ArrowRight className="h-4 w-4" /></Button>
            </div>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <Tabs defaultValue="by-program">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="by-program">Vista por Programa</TabsTrigger>
                    <TabsTrigger value="general">Vista General del Día</TabsTrigger>
                </TabsList>
                <TabsContent value="by-program">
                    {loading ? (
                         <div className="flex justify-center items-center h-64"><Spinner size="large" /></div>
                    ) : (
                        <PntViewByProgram
                            programs={programsForToday}
                            onItemClick={openDetailsModal}
                            onAddItemClick={openFormModal}
                        />
                    )}
                </TabsContent>
                <TabsContent value="general">
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Spinner size="large" />
                        </div>
                    ) : programsForToday.length > 0 ? (
                        <div className="w-full space-y-4">
                            {programsForToday.map(program => (
                                <Collapsible key={program.id} defaultOpen={true} className="border rounded-lg">
                                <CollapsibleTrigger asChild>
                                    <div className={cn("flex w-full cursor-pointer items-center justify-between rounded-t-lg p-4 text-left group", program.color)}>
                                    <div className="flex-1 flex items-center gap-2">
                                        <Link href={`/grilla/${program.id}`} onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/10 hover:bg-black/20 text-white">
                                            <InfoIcon className="h-5 w-5" />
                                            </Button>
                                        </Link>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg">{program.name}</h3>
                                            <p className="font-normal text-sm">({program.schedule.startTime} - {program.schedule.endTime})</p>
                                        </div>
                                    </div>
                                    <ChevronDown className="h-5 w-5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="border-t">
                                        <div className="p-4 space-y-3">
                                        {Object.keys(program.auspicios).length === 0 && program.notas.length === 0 && program.pnts.length === 0 ? (
                                             <p className="text-center text-sm text-muted-foreground py-4">No hay pautas para este programa.</p>
                                        ) : (
                                            <>
                                            {Object.entries(program.auspicios).map(([bloque, items]) => (
                                                <div key={bloque} className="space-y-2">
                                                    <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><Group className="h-4 w-4"/> Auspicios: {bloque}</h4>
                                                    {items.map(item => <PntItemRow key={item.id} item={item} onClick={openDetailsModal} />)}
                                                </div>
                                            ))}
                                            {program.notas.length > 0 && (
                                                <div className="space-y-2 pt-2">
                                                    <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><FileText className="h-4 w-4"/> Notas</h4>
                                                    {program.notas.map(item => <PntItemRow key={item.id} item={item} onClick={openDetailsModal} />)}
                                                </div>
                                            )}
                                            {program.pnts.length > 0 && (
                                                <div className="space-y-2 pt-2">
                                                    <h4 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground"><Mic className="h-4 w-4"/> PNTs</h4>
                                                    {program.pnts.map(item => <PntItemRow key={item.id} item={item} onClick={openDetailsModal} />)}
                                                </div>
                                            )}
                                            </>
                                        )}
                                        </div>
                                        <div className="flex justify-center p-3 border-t">
                                        <Button variant="outline" size="sm" onClick={() => openFormModal(program.id)}>
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Nuevo
                                        </Button>
                                        </div>
                                    </div>
                                </CollapsibleContent>
                                </Collapsible>
                            ))}
                        </div>
                    ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8 border-2 border-dashed rounded-lg">
                        <h3 className="text-xl font-semibold">No hay programas para hoy</h3>
                        <p className="text-muted-foreground mt-2">La grilla de programas para el día de hoy está vacía.</p>
                    </div>
                    )}
                </TabsContent>
            </Tabs>
        </main>
      </div>

      <PntAuspicioFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        clients={clients}
        onSave={handleItemSave}
      />
      
      {selectedItem && (
        <PntAuspicioDetailsDialog
            isOpen={isDetailsOpen}
            onOpenChange={setIsDetailsOpen}
            item={selectedItem}
            onToggleRead={handleToggleRead}
            onDelete={canManage ? openDeleteItemDialog : undefined}
        />
      )}
      {itemToDelete && canManage && (
          <DeleteItemDialog
            isOpen={isDeleteItemDialogOpen}
            onOpenChange={setIsDeleteItemDialogOpen}
            item={itemToDelete}
            onConfirmDelete={handleDeleteItem}
        />
      )}
    </>
  );
}
