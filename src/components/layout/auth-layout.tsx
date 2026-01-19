
'use client';
import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ObjectiveReminderBanner } from '@/components/objectives/objective-reminder-banner';

const publicRoutes = ['/login', '/register', '/privacy-policy', '/terms-of-service', '/'];

export function AuthLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isPublic = publicRoutes.includes(pathname);

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
