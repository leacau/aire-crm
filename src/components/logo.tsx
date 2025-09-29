import Image from 'next/image';
import { useSidebar } from './ui/sidebar';
import { cn } from '@/lib/utils';

export function Logo({ isInSidebar = false }: { isInSidebar?: boolean }) {
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <div className="flex items-center gap-2.5 font-bold">
      <Image src="/logo.webp" alt="Logo de Aire de Santa Fe" width={32} height={32} className='rounded-md' priority />
      <span className={cn(
        "font-headline text-xl",
        isInSidebar ? "text-sidebar-foreground" : "text-foreground",
        isInSidebar && isCollapsed && "hidden"
      )}>
        CRM Aire
      </span>
    </div>
  );
}
