'use client';

import { useAuth } from '@/hooks/use-auth';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  Users,
  FileText,
  LayoutDashboard,
  Megaphone,
  Radio,
  Repeat,
  Target,
  Trophy,
  DollarSign,
  Palmtree,
  Activity,
  Users2,
  BadgePercent,
  Upload,
  Crosshair,
  MessageSquare,
  Database,
  FileSpreadsheet,
  ClipboardList
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScreenName } from '@/lib/types';

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ElementType;
  screenName: ScreenName;
  variant: 'default' | 'ghost';
}

export function AppSidebar() {
  const pathname = usePathname();
  const { userInfo } = useAuth();

  const sidebarItems: SidebarItem[] = [
    { title: 'Dashboard', href: '/', icon: LayoutDashboard, screenName: 'Dashboard', variant: 'ghost' },
    { title: 'Objetivos', href: '/objectives', icon: Crosshair, screenName: 'Objectives', variant: 'ghost' },
    { title: 'Oportunidades', href: '/opportunities', icon: Trophy, screenName: 'Opportunities', variant: 'ghost' },
    { title: 'Prospectos', href: '/prospects', icon: Target, screenName: 'Prospects', variant: 'ghost' },
    { title: 'Clientes', href: '/clients', icon: Users, screenName: 'Clients', variant: 'ghost' },
    { title: 'Seguimiento', href: '/coaching', icon: ClipboardList, screenName: 'Coaching', variant: 'ghost' },
    { title: 'Grilla', href: '/grilla', icon: Radio, screenName: 'Grilla', variant: 'ghost' },
    { title: 'PNTs', href: '/pnts', icon: Megaphone, screenName: 'PNTs', variant: 'ghost' },
    { title: 'Canjes', href: '/canjes', icon: Repeat, screenName: 'Canjes', variant: 'ghost' },
    { title: 'Facturación', href: '/billing', icon: DollarSign, screenName: 'Billing', variant: 'ghost' },
    { title: 'Facturas', href: '/invoices', icon: FileText, screenName: 'Invoices', variant: 'ghost' },
    { title: 'Chat', href: '/chat', icon: MessageSquare, screenName: 'Chat', variant: 'ghost' },
    { title: 'Calendario', href: '/calendar', icon: Calendar, screenName: 'Calendar', variant: 'ghost' },
    { title: 'Licencias', href: '/licencias', icon: Palmtree, screenName: 'Licenses', variant: 'ghost' },
    { title: 'Aprobaciones', href: '/approvals', icon: CheckSquare, screenName: 'Approvals', variant: 'ghost' },
    { title: 'Actividad', href: '/activity', icon: Activity, screenName: 'Activity', variant: 'ghost' },
    { title: 'Equipo', href: '/team', icon: Users2, screenName: 'Team', variant: 'ghost' },
    { title: 'Tarifas', href: '/rates', icon: BadgePercent, screenName: 'Rates', variant: 'ghost' },
    { title: 'Cotizador', href: '/quotes', icon: FileSpreadsheet, screenName: 'Quotes', variant: 'ghost' },
    { title: 'Reportes', href: '/reports', icon: BarChart3, screenName: 'Reports', variant: 'ghost' },
    { title: 'Importar', href: '/import', icon: Upload, screenName: 'Import', variant: 'ghost' },
    { title: 'Mapeo Tango', href: '/tango-mapping', icon: Database, screenName: 'TangoMapping', variant: 'ghost' },
  ];

  const filteredItems = useMemo(() => {
    if (!userInfo) return [];
    
    // Super admin can see everything
    if (userInfo.email === 'lchena@airedesantafe.com.ar') return sidebarItems;

    return sidebarItems.filter((item) => {
      // Check permissions if available
      if (userInfo.permissions) {
        const permission = userInfo.permissions[item.screenName];
        return permission?.view;
      }
      return true; 
    });
  }, [userInfo]);

  return (
    <div className="hidden border-r bg-zinc-950 text-zinc-100 lg:block w-[240px] h-screen sticky top-0 overflow-hidden flex flex-col z-20">
      <div className="flex h-full flex-col gap-2">
        <div className="flex h-[60px] items-center border-b border-zinc-800 px-6 shrink-0">
          <Link className="flex items-center gap-2 font-semibold text-white" href="/">
            <Logo isInSidebar={true} />
          </Link>
        </div>
        <ScrollArea className="flex-1 px-4">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4 space-y-1 py-4">
            {filteredItems.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
                  pathname === item.href
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </nav>
        </ScrollArea>
      </div>
    </div>
  );
}
