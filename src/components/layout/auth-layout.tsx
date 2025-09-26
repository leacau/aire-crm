
'use client';
import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';

const publicRoutes = ['/login', '/register'];

export function AuthLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isPublic = publicRoutes.includes(pathname);

    if (isPublic) {
        return <>{children}</>;
    }

    return (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
    )
}
