'use client';

import React from 'react';
import type { Program } from '@/lib/types';
import { addDays, startOfWeek, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface GrillaSemanalProps {
  programs: Program[];
  onDayClick: (date: Date) => void;
}

export function GrillaSemanal({ programs, onDayClick }: GrillaSemanalProps) {
  const today = new Date();
  const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfThisWeek, i));

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
      {weekDays.map(day => {
        const dayOfWeek = day.getDay();
        const programsForDay = programs.filter(p => p.daysOfWeek.includes(dayOfWeek));

        return (
          <div key={day.toISOString()} className="flex flex-col gap-4">
            <h3 
              className="text-center font-semibold text-lg cursor-pointer hover:text-primary"
              onClick={() => onDayClick(day)}
            >
              <span className="capitalize">{format(day, 'eeee', { locale: es })}</span>
              <span className="block text-sm font-normal text-muted-foreground">{format(day, 'd', { locale: es })}</span>
            </h3>
            <div className="space-y-2">
                {programsForDay
                  .sort((a,b) => a.startTime.localeCompare(b.startTime))
                  .map(program => (
                  <Card key={program.id} className={cn("text-center text-sm p-2 cursor-pointer hover:shadow-md", program.color)} onClick={() => onDayClick(day)}>
                    <p className="font-semibold">{program.name}</p>
                    <p className="text-xs">{program.startTime} - {program.endTime}</p>
                  </Card>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
