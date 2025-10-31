

'use client';

import { Header } from '@/components/layout/header';
import { TeamPerformanceTable } from '@/components/team/team-performance-table';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { CalendarSearch } from 'lucide-react';
import { LicensesManagementDialog } from '@/components/team/licenses-management-dialog';

export default function TeamPage() {
  const { userInfo, loading } = useAuth();
  const router = useRouter();
  const [isLicenseDialogOpen, setIsLicenseDialogOpen] = useState(false);

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
        <Header title="Rendimiento y Gestión de Equipo">
            <Button variant="outline" onClick={() => setIsLicenseDialogOpen(true)}>
                <CalendarSearch className="mr-2 h-4 w-4" />
                Gestionar Licencias
            </Button>
        </Header>
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <TeamPerformanceTable />
        </main>
      </div>
      <LicensesManagementDialog
        isOpen={isLicenseDialogOpen}
        onOpenChange={setIsLicenseDialogOpen}
      />
    </>
  );
}
