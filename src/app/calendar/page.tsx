
'use client';

import { Header } from '@/components/layout/header';
import { GoogleCalendar } from '@/components/calendar/google-calendar';

export default function CalendarPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Calendario" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <GoogleCalendar />
      </main>
    </div>
  );
}
