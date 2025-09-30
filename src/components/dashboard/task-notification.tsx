
'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TaskNotificationProps {
  overdueCount: number;
  dueTodayCount: number;
  onShowTasks: () => void;
}

export function TaskNotification({ overdueCount, dueTodayCount, onShowTasks }: TaskNotificationProps) {
  const overdueText = overdueCount > 0 ? `${overdueCount} vencida${overdueCount > 1 ? 's' : ''}` : '';
  const dueTodayText = dueTodayCount > 0 ? `${dueTodayCount} para hoy` : '';
  const connector = overdueText && dueTodayText ? ' y ' : '';

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md p-2">
      <div className="bg-amber-100 border-2 border-amber-300 text-amber-900 rounded-lg shadow-lg flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="text-sm font-medium">
            Tienes tareas pendientes: {overdueText}{connector}{dueTodayText}.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-amber-900 hover:bg-amber-200 h-auto px-2 py-1"
          onClick={onShowTasks}
        >
          Ver
        </Button>
      </div>
    </div>
  );
}
