
'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { GoogleCalendar } from '@/components/calendar/google-calendar';
import { useAuth } from '@/hooks/use-auth';
import type { User } from '@/lib/types';
import { getAllUsers } from '@/lib/firebase-service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function CalendarPage() {
  const { userInfo, isBoss } = useAuth();
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(userInfo?.id);

  useEffect(() => {
    if (userInfo) {
      setSelectedUserId(userInfo.id);
    }
    if (isBoss) {
      getAllUsers('Asesor').then(users => {
        const allUsersForFilter = userInfo ? [userInfo, ...users.filter(u => u.id !== userInfo.id)] : users;
        setAdvisors(allUsersForFilter);
      });
    }
  }, [isBoss, userInfo]);

  return (
    <div className="flex flex-col h-full">
      <Header title="Calendario">
        {isBoss && (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Ver calendario de..." />
              </SelectTrigger>
              <SelectContent>
                {advisors.map(advisor => (
                  <SelectItem key={advisor.id} value={advisor.id}>{advisor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
      </Header>
      <main className="flex-1 overflow-auto">
        <GoogleCalendar key={selectedUserId} selectedUserId={selectedUserId} />
      </main>
    </div>
  );
}
