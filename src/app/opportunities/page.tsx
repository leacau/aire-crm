import { Header } from '@/components/layout/header';
import { KanbanBoard } from '@/components/opportunities/kanban-board';

export default function OpportunitiesPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Opportunities" />
      <main className="flex-1 overflow-auto">
        <KanbanBoard />
      </main>
    </div>
  );
}
