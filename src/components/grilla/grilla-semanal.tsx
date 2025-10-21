
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Program, CommercialItem } from '@/lib/types';
import { addDays, startOfWeek, format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { getCommercialItems } from '@/lib/firebase-service';

interface GrillaSemanalProps {
  programs: Program[];
  onDayClick: (date: Date) => void;
  onEditProgram: (program: Program) => void;
  onDeleteProgram: (program: Program) => void;
  canManage: boolean;
  currentDate: Date;
}

export function GrillaSemanal({ programs, onDayClick, onEditProgram, onDeleteProgram, canManage, currentDate }: GrillaSemanalProps) {
  const startOfGivenWeek = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfGivenWeek, i));

  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchAvailability = async () => {
      const promises = weekDays.map(day => getCommercialItems(format(day, 'yyyy-MM-dd')));
      const results = await Promise.all(promises);
      
      const newAvailability: Record<string, boolean> = {};
      results.forEach((dailyItems, index) => {
        const dayKey = format(weekDays[index], 'yyyy-MM-dd');
        const programIdsWithAvailability = new Set(
          dailyItems
            .filter(item => item.status === 'Disponible')
            .map(item => item.programId)
        );
        programs.forEach(program => {
            newAvailability[`${dayKey}-${program.id}`] = programIdsWithAvailability.has(program.id);
        });
      });
      setAvailability(newAvailability);
    };

    fetchAvailability();
  }, [currentDate, programs]);


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
          <div key={day.toISOString()} className="flex flex-col gap-2 md:gap-4">
            <Card className="md:hidden cursor-pointer hover:bg-muted/50" onClick={() => onDayClick(day)}>
                <CardHeader className="p-3">
                    <CardTitle className={cn(
                        "text-base font-semibold capitalize flex items-center justify-between",
                        isToday(day) && "text-primary font-bold"
                    )}>
                        <span>{format(day, 'eeee d', { locale: es })}</span>
                        <span className="text-sm font-normal text-muted-foreground">{'>'}</span>
                    </CardTitle>
                </CardHeader>
            </Card>

            <h3 
              className="text-center font-semibold text-lg cursor-pointer hover:text-primary hidden md:block"
              onClick={() => onDayClick(day)}
            >
              <span className="capitalize">{format(day, 'eeee', { locale: es })}</span>
              <span className={cn(
                "block text-sm font-normal text-muted-foreground",
                 isToday(day) && "text-primary font-bold"
              )}>
                {format(day, 'd', { locale: es })}
              </span>
            </h3>
            <div className="space-y-2 hidden md:block">
                {programsForDay.map(programWithSchedule => {
                  const dayKey = format(day, 'yyyy-MM-dd');
                  const hasAvailability = availability[`${dayKey}-${programWithSchedule.id}`];

                  return (
                    <Card 
                      key={`${programWithSchedule.id}-${programWithSchedule.schedule.id}`} 
                      className={cn("text-center text-sm p-2 relative group", programWithSchedule.color)}
                    >
                      <div onClick={() => onDayClick(day)} className="cursor-pointer">
                        <p className="font-semibold flex items-center justify-center gap-1">
                           {hasAvailability && <span className="text-green-500 text-lg leading-none -mt-1">•</span>}
                           {programWithSchedule.name}
                        </p>
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
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
