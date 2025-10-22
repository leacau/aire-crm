
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Program, CommercialItem } from '@/lib/types';
import { addDays, startOfWeek, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getCommercialItems } from '@/lib/firebase-service';

interface GrillaPdfProps {
  programs: Program[];
  currentDate: Date;
  options: {
    dateType: 'generic' | 'dated';
    includeItems: boolean;
  };
}

const statusColors: Record<CommercialItem['status'], string> = {
  'Disponible': 'bg-gray-200 text-gray-800',
  'Reservado': 'bg-yellow-200 text-yellow-800',
  'Vendido': 'bg-green-200 text-green-800',
};

const DayColumn = ({ day, programs, items, options }: { day: Date, programs: any[], items: CommercialItem[], options: GrillaPdfProps['options'] }) => {
    return (
        <div className="flex-1 flex flex-col gap-2">
            <h3 className="font-bold text-center text-xs p-1 bg-gray-200 rounded-t-md">
                {options.dateType === 'generic' 
                    ? format(day, 'eeee', { locale: es }).toUpperCase()
                    : format(day, 'eeee d', { locale: es }).toUpperCase()
                }
            </h3>
            <div className="flex-1 space-y-1">
                {programs.map(program => {
                    const programItems = options.includeItems ? items.filter(item => item.programId === program.id) : [];
                    return (
                        <div key={program.id} className={cn("p-1 rounded text-center text-[8px] leading-tight", program.color)}>
                            <p className="font-bold">{program.name}</p>
                            <p className="text-[7px]">{program.schedule.startTime} - {program.schedule.endTime}</p>
                            {options.includeItems && (
                                <div className="mt-1 space-y-0.5 bg-white/50 p-0.5 rounded-sm">
                                {programItems.length > 0 ? (
                                    programItems.map(item => (
                                        <div key={item.id} className={cn("p-0.5 rounded-sm text-left", statusColors[item.status])}>
                                            <p className="font-semibold text-[7px] truncate">{item.description}</p>
                                            <p className="text-[6px] truncate">{item.clientName || ''}</p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-4"></div>
                                )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};


export const GrillaPdf = React.forwardRef<HTMLDivElement, GrillaPdfProps>(({ programs, currentDate, options }, ref) => {
    const startOfGivenWeek = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfGivenWeek, i));

    const [weekItems, setWeekItems] = useState<Record<string, CommercialItem[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!options.includeItems) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const fetchAllWeekItems = async () => {
            const promises = weekDays.map(day => getCommercialItems(format(day, 'yyyy-MM-dd')));
            const results = await Promise.all(promises);
            const itemsByDay: Record<string, CommercialItem[]> = {};
            results.forEach((dailyItems, index) => {
                const dayKey = format(weekDays[index], 'yyyy-MM-dd');
                itemsByDay[dayKey] = dailyItems;
            });
            setWeekItems(itemsByDay);
            setLoading(false);
        };
        fetchAllWeekItems();
    }, [currentDate, options.includeItems]);

    return (
      <div ref={ref} className="bg-white p-4">
         <header className="flex justify-between items-start mb-4">
            <div>
                <h1 className="text-xl font-bold">Aire de Santa Fe - Grilla semanal</h1>
                <h2 className="text-lg font-semibold capitalize text-gray-600">
                    {options.dateType === 'generic' ? 'Semana Tipo' : format(startOfGivenWeek, "MMMM yyyy", { locale: es })}
                </h2>
            </div>
            <div className="w-12 h-auto">
                 <img src="/logo.webp" alt="Logo AIRE" style={{width: '50px', height: 'auto' }} />
            </div>
        </header>

        {loading && options.includeItems ? (
            <p>Cargando datos para el PDF...</p>
        ) : (
            <div className="flex gap-2">
                {weekDays.map(day => {
                     const dayOfWeek = day.getDay() === 0 ? 7 : day.getDay();
                     const programsForDay = programs
                         .flatMap(p => 
                             p.schedules
                              .filter(s => s.daysOfWeek.includes(dayOfWeek))
                              .map(s => ({ ...p, schedule: s }))
                         )
                         .sort((a,b) => a.schedule.startTime.localeCompare(b.schedule.startTime));
                    const dayKey = format(day, 'yyyy-MM-dd');
                    const itemsForDay = weekItems[dayKey] || [];

                     return (
                        <DayColumn key={dayKey} day={day} programs={programsForDay} items={itemsForDay} options={options}/>
                     )
                })}
            </div>
        )}
      </div>
    );
});

GrillaPdf.displayName = 'GrillaPdf';
