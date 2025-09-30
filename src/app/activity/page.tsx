

'use client';

import { Header } from '@/components/layout/header';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { ActivityFeed } from '@/components/activity/activity-feed';

export default function ActivityPage() {
  const { userInfo, loading, isBoss } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isBoss) {
      router.push('/');
    }
  }, [userInfo, loading, router, isBoss]);
  
  if (loading || !isBoss) {
    return (
       <div className="flex h-full w-full items-center justify-center">
          <Spinner size="large" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Actividad General" />
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <ActivityFeed />
      </main>
    </div>
  );
}
