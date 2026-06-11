'use client';
import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import dynamic from 'next/dynamic';

const ObjectiveReminderBanner = dynamic(
    () => import('@/components/objectives/objective-reminder-banner').then(mod => mod.ObjectiveReminderBanner),
    { ssr: false }
);

const publicRoutes = ['/login', '/register', '/privacy-policy', '/terms-of-service', '/'];

export function AuthLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const isPublic = publicRoutes.includes(pathname) || pathname.startsWith('/public/');

    if (isPublic) {
        return <>{children}</>;
    }

    return (
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <ObjectiveReminderBanner />
            {children}
          </SidebarInset>
        </SidebarProvider>
    )
}
