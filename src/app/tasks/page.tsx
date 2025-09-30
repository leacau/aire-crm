
'use client';

import { Header } from '@/components/layout/header';
import { GoogleTasksView } from '@/components/tasks/google-tasks-view';

export default function TasksPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Google Tasks" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <GoogleTasksView />
      </main>
    </div>
  );
}
