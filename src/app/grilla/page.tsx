
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { GrillaSemanal } from '@/components/grilla/grilla-semanal';
import { GrillaDiaria } from '@/components/grilla/grilla-diaria';
import { ProgramFormDialog } from '@/components/grilla/program-form-dialog';
import type { Program, CommercialItem } from '@/lib/types';
import { getPrograms, saveProgram, updateProgram, deleteProgram, saveCommercialItem, updateCommercialItem, deleteCommercialItem } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CommercialItemFormDialog } from '@/components/grilla/commercial-item-form-dialog';
import { addDays, format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';


export default function GrillaPage() {
  const { userInfo, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<'semanal' | 'diaria'>('semanal');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const [isProgramFormOpen, setIsProgramFormOpen] = useState(false);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);
  const [selectedItem, setSelectedItem] = useState<CommercialItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<CommercialItem | null>(null);
  const [preselectedDataForItem, setPreselectedDataForItem] = useState<{ programId?: string, date?: Date } | null>(null);

  const canManage = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Administracion';


  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    try {
        const fetchedPrograms = await getPrograms();
        setPrograms(fetchedPrograms);
    } catch (error) {
        console.error("Error fetching programs:", error);
        toast({ title: "Error al cargar los programas", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);


  const handleDayClick = (day: Date) => {
    setCurrentDate(day);
    setView('diaria');
  };
  
  const handleItemClick = (item: CommercialItem) => {
    setSelectedItem(item);
    setIsItemFormOpen(true);
  };
  
  const handleOpenItemForm = (programId: string, date: Date) => {
    setSelectedItem(null);
    setPreselectedDataForItem({ programId, date });
    setIsItemFormOpen(true);
  }


  const handleBackToWeek = () => {
    setView('semanal');
    setSelectedItem(null); // Clear selection when going back
  };

  const openProgramForm = (program: Program | null = null) => {
    setSelectedProgram(program);
    setIsProgramFormOpen(true);
  };

  const handleSaveProgram = async (programData: Omit<Program, 'id'>) => {
    if (!userInfo) return;
    try {
        if (selectedProgram) { // Editing
            await updateProgram(selectedProgram.id, programData, userInfo.id);
            toast({ title: "Programa Actualizado" });
        } else { // Creating
            await saveProgram(programData, userInfo.id);
            toast({ title: "Programa Creado" });
        }
        fetchPrograms();
    } catch (error) {
        console.error("Error saving program:", error);
        toast({ title: "Error al guardar el programa", variant: "destructive" });
    }
  };

  const handleDeleteProgram = async () => {
    if (!programToDelete || !userInfo) return;
    try {
        await deleteProgram(programToDelete.id, userInfo.id);
        toast({ title: "Programa Eliminado" });
        fetchPrograms();
    } catch (error) {
        console.error("Error deleting program:", error);
        toast({ title: "Error al eliminar el programa", variant: "destructive" });
    } finally {
        setProgramToDelete(null);
    }
  };
  
  const handleSaveCommercialItem = async (item: Omit<CommercialItem, 'id' | 'date'>, newDates: Date[]) => {
      if (!userInfo) return;
      try {
        if (selectedItem) { // Editing existing item
            const originalDateStr = format(new Date(selectedItem.date), 'yyyy-MM-dd');
            const newDatesStr = newDates.map(d => format(d, 'yyyy-MM-dd'));

            const isOriginalDateKept = newDatesStr.includes(originalDateStr);

            if (isOriginalDateKept) {
                await updateCommercialItem(selectedItem.id, item);
                const datesToAdd = newDates.filter(d => !isSameDay(d, new Date(selectedItem.date)));
                if (datesToAdd.length > 0) {
                  await saveCommercialItem(item, datesToAdd, userInfo.id);
                }
            } else {
                await deleteCommercialItem(selectedItem.id);
                await saveCommercialItem(item, newDates, userInfo.id);
            }
             toast({ title: 'Elemento comercial actualizado' });

        } else { // Creating new items
            await saveCommercialItem(item, newDates, userInfo.id);
            toast({ title: 'Elemento(s) comercial(es) guardado(s)', description: `${newDates.length} elemento(s) han sido creados.` });
        }
        
        if(view === 'diaria') {
            setView('semanal');
            setTimeout(() => setView('diaria'), 0);
        }
      } catch (error) {
          console.error("Error saving commercial item(s):", error);
          toast({ title: 'Error al guardar el elemento', variant: 'destructive' });
      }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await deleteCommercialItem(itemToDelete.id);
      toast({ title: 'Elemento comercial eliminado' });
      setIsItemFormOpen(false); // Close the dialog if it was open
      
      // Refresh view
      if (view === 'diaria') {
        setView('semanal');
        setTimeout(() => setView('diaria'), 0);
      }
    } catch (error) {
      console.error("Error deleting commercial item:", error);
      toast({ title: 'Error al eliminar el elemento', variant: 'destructive' });
    } finally {
      setItemToDelete(null);
    }
  };


  if (authLoading || loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  const navigateWeek = (direction: 'next' | 'prev') => {
    const amount = direction === 'next' ? 7 : -7;
    setCurrentDate(prev => addDays(prev, amount));
  };


  return (
    <>
      <div className="flex flex-col h-full">
        <Header title="Grilla Comercial">
          {view === 'semanal' && (
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')}><ArrowLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => navigateWeek('next')}><ArrowRight className="h-4 w-4" /></Button>
                </div>
                <h3 className="text-lg font-semibold capitalize min-w-[150px] text-center">
                  {format(currentDate, 'MMMM yyyy', { locale: es })}
                </h3>
             </div>
          )}
          {view === 'diaria' && (
            <Button variant="outline" onClick={handleBackToWeek}>
              Volver a la semana
            </Button>
          )}
          {canManage && (
            <div className="flex items-center gap-2">
              <Button onClick={() => openProgramForm()}>
                  <PlusCircle className="mr-2 h-4 w-4"/>
                  Nuevo Programa
              </Button>
              <Button variant="secondary" onClick={() => { setSelectedItem(null); setPreselectedDataForItem(null); setIsItemFormOpen(true);}}>
                  <PlusCircle className="mr-2 h-4 w-4"/>
                  Nuevo Elemento Comercial
              </Button>
            </div>
          )}
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {view === 'semanal' ? (
            <GrillaSemanal 
                programs={programs} 
                onDayClick={handleDayClick} 
                onEditProgram={openProgramForm}
                onDeleteProgram={(p) => setProgramToDelete(p)}
                canManage={!!canManage}
                currentDate={currentDate}
            />
          ) : (
            <GrillaDiaria 
                date={currentDate} 
                programs={programs}
                canManage={!!canManage}
                onItemClick={handleItemClick}
                onAddItemClick={handleOpenItemForm}
            />
          )}
        </main>
      </div>
       <ProgramFormDialog
        isOpen={isProgramFormOpen}
        onOpenChange={setIsProgramFormOpen}
        onSave={handleSaveProgram}
        program={selectedProgram}
      />
      {
        <CommercialItemFormDialog
            isOpen={isItemFormOpen}
            onOpenChange={setIsItemFormOpen}
            onSave={handleSaveCommercialItem}
            onDelete={item => setItemToDelete(item)}
            item={selectedItem}
            programs={programs}
            preselectedData={preselectedDataForItem}
        />
      }
      <AlertDialog open={!!programToDelete} onOpenChange={(open) => !open && setProgramToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar Programa?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible y eliminará permanentemente el programa "{programToDelete?.name}".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteProgram} variant="destructive">
                    Eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar Elemento Comercial?</AlertDialogTitle>
                <AlertDialogDescription>
                    Esta acción es irreversible y eliminará permanentemente el elemento: "{itemToDelete?.description}".
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteItem} variant="destructive">
                    Eliminar
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
