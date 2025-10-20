'use client';

import React, { useState } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { GrillaSemanal } from '@/components/grilla/grilla-semanal';
import { GrillaDiaria } from '@/components/grilla/grilla-diaria';
import { ProgramFormDialog } from '@/components/grilla/program-form-dialog';
import type { Program } from '@/lib/types';
import { programs as initialPrograms } from '@/lib/grilla-config'; // Temporalmente desde config

export default function GrillaPage() {
  const { userInfo, loading: authLoading, isBoss } = useAuth();
  const [view, setView] = useState<'semanal' | 'diaria'>('semanal');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [programs, setPrograms] = useState<Program[]>(initialPrograms);
  const [isProgramFormOpen, setIsProgramFormOpen] = useState(false);

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setView('diaria');
  };

  const handleBackToWeek = () => {
    setView('semanal');
  };

  const handleSaveProgram = (program: Omit<Program, 'id'>) => {
    // Lógica para guardar el programa - Temporalmente en estado local
    const newProgram: Program = { id: `prog-${Date.now()}`, ...program };
    setPrograms(prev => [...prev, newProgram]);
    console.log("Saving program:", newProgram);
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
        <Header title="Grilla Comercial">
          {view === 'diaria' && (
            <Button variant="outline" onClick={handleBackToWeek}>
              Volver a la semana
            </Button>
          )}
          {isBoss && (
             <Button onClick={() => setIsProgramFormOpen(true)}>
                <PlusCircle className="mr-2 h-4 w-4"/>
                Nuevo Programa
            </Button>
          )}
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {view === 'semanal' ? (
            <GrillaSemanal programs={programs} onDayClick={handleDayClick} />
          ) : (
            <GrillaDiaria date={selectedDate} programs={programs} />
          )}
        </main>
      </div>
       <ProgramFormDialog
        isOpen={isProgramFormOpen}
        onOpenChange={setIsProgramFormOpen}
        onSave={handleSaveProgram}
      />
    </>
  );
}
