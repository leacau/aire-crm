

'use client';

import { Header } from '@/components/layout/header';
import { TeamPerformanceTable } from '@/components/team/team-performance-table';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';

export default function TeamPage() {
  const { userInfo, loading } = useAuth();
  const router = useRouter();

  const canAccess = userInfo?.role === 'Jefe' || userInfo?.role === 'Gerencia' || userInfo?.role === 'Administracion';

  useEffect(() => {
    if (!loading && !canAccess) {
      router.push('/');
    }
  }, [userInfo, loading, router, canAccess]);
  
  if (loading || !canAccess) {
    return (
       <div className="flex h-full w-full items-center justify-center">
          <Spinner size="large" />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <Header title="Rendimiento y Gestión de Equipo" />
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <TeamPerformanceTable />
        </main>
      </div>
    </>
  );
}
