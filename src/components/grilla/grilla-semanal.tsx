
'use client';

import React from 'react';
import type { Program } from '@/lib/types';
import { addDays, startOfWeek, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';

interface GrillaSemanalProps {
  programs: Program[];
  onDayClick: (date: Date) => void;
  onEditProgram: (program: Program) => void;
  onDeleteProgram: (program: Program) => void;
  canManage: boolean;
}

export function GrillaSemanal({ programs, onDayClick, onEditProgram, onDeleteProgram, canManage }: GrillaSemanalProps) {
  const today = new Date();
  const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfThisWeek, i));

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
      {weekDays.map(day => {
        const dayOfWeek = day.getDay() === 0 ? 7 : day.getDay(); // Adjust Sunday to be 7
        
        const programsForDay = programs
            .flatMap(p => 
                p.schedules
                 .filter(s => s.daysOfWeek.includes(dayOfWeek))
                 .map(s => ({ ...p, schedule: s }))
            )
            .sort((a,b) => a.schedule.startTime.localeCompare(b.schedule.startTime));

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
                {programsForDay.map(programWithSchedule => (
                  <Card 
                    key={`${programWithSchedule.id}-${programWithSchedule.schedule.id}`} 
                    className={cn("text-center text-sm p-2 relative group", programWithSchedule.color)}
                  >
                    <div onClick={() => onDayClick(day)} className="cursor-pointer">
                      <p className="font-semibold">{programWithSchedule.name}</p>
                      <p className="text-xs">{programWithSchedule.schedule.startTime} - {programWithSchedule.schedule.endTime}</p>
                      <p className="text-xs text-muted-foreground truncate">{programWithSchedule.conductores}</p>
                    </div>
                    {canManage && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem onClick={() => onEditProgram(programs.find(p => p.id === programWithSchedule.id)!)}>
                                        <Edit className="mr-2 h-4 w-4" />
                                        Editar
                                    </DropdownMenuItem>
                                     <DropdownMenuItem onClick={() => onDeleteProgram(programs.find(p => p.id === programWithSchedule.id)!)} className="text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Eliminar
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}
                  </Card>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
