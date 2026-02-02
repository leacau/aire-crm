

'use client';

import { Header } from '@/components/layout/header';
import { TeamPerformanceTable } from '@/components/team/team-performance-table';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { hasManagementPrivileges } from '@/lib/role-utils';
import { OpportunityAlertsManager } from '@/components/team/opportunity-alerts-manager';

export default function TeamPage() {
  const { userInfo, loading } = useAuth();
  const router = useRouter();

  const canManage = hasManagementPrivileges(userInfo);
  const isSuperAdmin = userInfo?.email === 'lchena@airedesantafe.com.ar';

  useEffect(() => {
    if (!loading && !canManage) {
      router.push('/');
    }
  }, [userInfo, loading, router, canManage]);
  
  if (loading || !canManage) {
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
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 space-y-8">
          <TeamPerformanceTable />
          <OpportunityAlertsManager />
        </main>
      </div>
    </>
  );
}
