
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, CalendarDays, Tv, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { getProgram } from '@/lib/firebase-service';
import type { Program } from '@/lib/types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

const dayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function ProgramDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      setLoading(true);
      getProgram(id)
        .then(programData => {
          if (programData) {
            setProgram(programData);
          } else {
            router.push('/grilla');
          }
        })
        .catch(() => router.push('/grilla'))
        .finally(() => setLoading(false));
    }
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner size="large" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p>Programa no encontrado.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={program.name}>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
      </Header>
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{program.name}</CardTitle>
              {program.description && (
                <CardDescription className="pt-2">{program.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Tv className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">Conductores:</span>
                  <span>{program.conductores || 'No especificado'}</span>
                </div>
                 <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">Productores:</span>
                  <span>{program.productores || 'No especificado'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Horarios de Emisión</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {program.schedules && program.schedules.map(schedule => (
                  <div key={schedule.id} className="p-3 border rounded-md flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium">
                      <Clock className="h-5 w-5 text-primary" />
                      <span>{schedule.startTime} - {schedule.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <CalendarDays className="h-5 w-5 text-primary" />
                       <div className="flex flex-wrap gap-1">
                        {schedule.daysOfWeek.sort().map(day => {
                          // Sunday (0 or 7) should map to Domingo (index 0)
                          const dayIndex = day === 7 ? 0 : day;
                          return (
                            <Badge key={day} variant="secondary">{dayLabels[dayIndex]}</Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
