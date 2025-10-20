'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { GrillaSemanal } from '@/components/grilla/grilla-semanal';
import { GrillaDiaria } from '@/components/grilla/grilla-diaria';
import { ProgramFormDialog } from '@/components/grilla/program-form-dialog';
import type { Program } from '@/lib/types';
import { getPrograms, saveProgram, updateProgram, deleteProgram } from '@/lib/firebase-service';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


export default function GrillaPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<'semanal' | 'diaria'>('semanal');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  const [isProgramFormOpen, setIsProgramFormOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [programToDelete, setProgramToDelete] = useState<Program | null>(null);


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
    setSelectedDate(day);
    setView('diaria');
  };

  const handleBackToWeek = () => {
    setView('semanal');
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
        <Header title="Grilla Comercial">
          {view === 'diaria' && (
            <Button variant="outline" onClick={handleBackToWeek}>
              Volver a la semana
            </Button>
          )}
          {isBoss && (
             <Button onClick={() => openProgramForm()}>
                <PlusCircle className="mr-2 h-4 w-4"/>
                Nuevo Programa
            </Button>
          )}
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {view === 'semanal' ? (
            <GrillaSemanal 
                programs={programs} 
                onDayClick={handleDayClick} 
                onEditProgram={openProgramForm}
                onDeleteProgram={(p) => setProgramToDelete(p)}
                canManage={isBoss}
            />
          ) : (
            <GrillaDiaria date={selectedDate} programs={programs} />
          )}
        </main>
      </div>
       <ProgramFormDialog
        isOpen={isProgramFormOpen}
        onOpenChange={setIsProgramFormOpen}
        onSave={handleSaveProgram}
        program={selectedProgram}
      />
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
    </>
  );
}
