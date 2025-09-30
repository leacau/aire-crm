import type { Metadata } from 'next';
import './globals.css';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AuthProvider } from '@/hooks/use-auth.tsx';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
  title: 'CRM Aire de Santa Fe',
  description: 'Visualiza y pronostica oportunidades de venta.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
            <AuthLayout>
                 {children}
            </AuthLayout>
        </AuthProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
