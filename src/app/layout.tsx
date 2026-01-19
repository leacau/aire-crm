import type { Metadata } from 'next';
import './globals.css';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/toaster';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AuthProvider } from '@/hooks/use-auth';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from "@vercel/speed-insights/next"
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

export const metadata: Metadata = {
  title: 'CRM Aire de Santa Fe',
  description: 'Visualiza y pronostica oportunidades de venta.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <meta name="google-site-verification" content="Vv-m6rWiQzmVjTmE-k_CZnJxGQhAbUxIMEgrrzq_zHw" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
            <AuthLayout>
                 {children}
            </AuthLayout>
             <FirebaseErrorListener />
        </AuthProvider>
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
