
'use client';

import React from 'react';
import type { ToolbarProps } from 'react-big-calendar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Views, type View } from 'react-big-calendar';
import { cn } from '@/lib/utils';

export const CalendarToolbar: React.FC<ToolbarProps> = ({
  label,
  localizer: { messages },
  onNavigate,
  onView,
  view,
  views,
}) => {
  const goToBack = () => {
    onNavigate('PREV');
  };

  const goToNext = () => {
    onNavigate('NEXT');
  };

  const goToCurrent = () => {
    onNavigate('TODAY');
  };

  const viewNamesGroup = (
    <div className='flex items-center gap-1 rounded-md bg-muted p-1'>
        {(views as View[]).map((name) => (
            <Button
            key={name}
            onClick={() => onView(name)}
            size="sm"
            variant={view === name ? 'default' : 'ghost'}
            className={cn(
                'px-3 h-8',
                view === name && 'bg-background text-foreground shadow-sm'
            )}
            >
            {messages[name]}
            </Button>
        ))}
    </div>
  );

  return (
    <div className="rbc-toolbar mb-4 flex flex-col md:flex-row items-center justify-between gap-4">
       <div className='flex items-center gap-2'>
            <Button onClick={goToCurrent} variant="outline" size="sm">
                {messages.today}
            </Button>
            <div className='flex items-center'>
                <Button onClick={goToBack} variant="ghost" size="icon" className='h-8 w-8'>
                    <ChevronLeft className='h-5 w-5' />
                </Button>
                <span className="text-lg font-semibold text-center w-48 capitalize">{label}</span>
                 <Button onClick={goToNext} variant="ghost" size="icon" className='h-8 w-8'>
                    <ChevronRight className='h-5 w-5' />
                </Button>
            </div>
       </div>

      <div className='flex items-center justify-end'>
          {viewNamesGroup}
      </div>
    </div>
  );
};
