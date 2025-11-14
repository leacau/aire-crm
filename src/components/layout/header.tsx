
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { CommandDialog } from '../command/command-dialog';

type HeaderProps = {
  title: string;
  children?: React.ReactNode;
};

export function Header({ title, children }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-auto min-h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6 flex-wrap py-2">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div className="hidden md:block">
          <SidebarTrigger />
        </div>
        <h1 className="flex-1 text-2xl font-bold font-headline tracking-tight">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
        {children}
        <CommandDialog />
        <UserNav />
      </div>
    </header>
  );
}
