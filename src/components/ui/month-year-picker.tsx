
'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMonth, getYear, setMonth, setYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from './button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthYearPickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
  className?: string;
}

const years = Array.from({ length: 10 }, (_, i) => getYear(new Date()) - 5 + i);
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: new Date(2000, i).toLocaleString('es', { month: 'long' }),
}));

export function MonthYearPicker({ date, onDateChange, className }: MonthYearPickerProps) {
  const selectedYear = getYear(date);
  const selectedMonth = getMonth(date);

  const handleMonthChange = (monthValue: string) => {
    const newDate = setMonth(date, parseInt(monthValue, 10));
    onDateChange(newDate);
  };

  const handleYearChange = (yearValue: string) => {
    const newDate = setYear(date, parseInt(yearValue, 10));
    onDateChange(newDate);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(date);
    newDate.setMonth(date.getMonth() + (direction === 'next' ? 1 : -1));
    onDateChange(newDate);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigateMonth('prev')}>
            <ChevronLeft className="h-4 w-4" />
        </Button>
      <Select value={String(selectedMonth)} onValueChange={handleMonthChange}>
        <SelectTrigger className="w-[150px] capitalize">
          <SelectValue placeholder="Mes" />
        </SelectTrigger>
        <SelectContent>
          {months.map(month => (
            <SelectItem key={month.value} value={String(month.value)} className="capitalize">
              {month.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(selectedYear)} onValueChange={handleYearChange}>
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Año" />
        </SelectTrigger>
        <SelectContent>
          {years.map(year => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
       <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => navigateMonth('next')}>
            <ChevronRight className="h-4 w-4" />
        </Button>
    </div>
  );
}
