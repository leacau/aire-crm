
'use client';
import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { useAuth } from '@/hooks/use-auth';
import { Spinner } from '@/components/ui/spinner';

const publicRoutes = ['/login', '/register'];

export function AuthLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, loading } = useAuth();
    const isPublic = publicRoutes.includes(pathname);

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center"></div>;
    }

    if (isPublic) {
        return <>{children}</>;
    }

    if (!user) {
        // Redirection is handled in useAuth, but as a fallback, don't render children
        // to prevent flashes of content.
        return <div className="flex h-screen w-full items-center justify-center"></div>;
    }

    return (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
    )
}
