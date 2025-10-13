
'use client';

import React from 'react';
import { Header } from '@/components/layout/header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

export default function DashboardPage() {
  const { userInfo } = useAuth();

  return (
    <div className="flex flex-col h-full">
      <Header title="Panel" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Bienvenido, {userInfo?.name || 'Usuario'}</CardTitle>
            <CardDescription>
              La aplicación se está cargando. Las funcionalidades completas del panel de control se restaurarán en breve.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Gracias por tu paciencia mientras resolvemos los problemas técnicos.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
