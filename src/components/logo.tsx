
'use client';

import Image from 'next/image';
import { useSidebar } from './ui/sidebar';
import { cn } from '@/lib/utils';

const SidebarAwareLogo = () => {
    const { state } = useSidebar();
    const isCollapsed = state === 'collapsed';

    return (
        <>
            <Image src="/logo.webp" alt="Logo de Aire de Santa Fe" width={32} height={32} className='rounded-md' priority />
            <span className={cn(
                "font-headline text-xl text-sidebar-foreground",
                isCollapsed && "hidden"
            )}>
                CRM Aire
            </span>
        </>
    );
};

const StandaloneLogo = () => (
    <>
        <Image src="/logo.webp" alt="Logo de Aire de Santa Fe" width={32} height={32} className='rounded-md' priority />
        <span className="font-headline text-xl text-foreground">
            CRM Aire
        </span>
    </>
);


export function Logo({ isInSidebar = false }: { isInSidebar?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 font-bold">
      {isInSidebar ? <SidebarAwareLogo /> : <StandaloneLogo />}
    </div>
  );
}
