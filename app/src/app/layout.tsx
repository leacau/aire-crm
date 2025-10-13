
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/hooks/use-auth';
import { Analytics } from '@vercel/analytics/next';
import { AuthLayout } from '@/components/layout/auth-layout';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
            <AuthLayout>{children}</AuthLayout>
        </AuthProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
