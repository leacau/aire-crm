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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { ScreenName } from '@/lib/types';

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ElementType;
  screenName: ScreenName;
}

interface SidebarGroup {
  groupLabel: string;
  items: SidebarItem[];
}

// Tipo unión para manejar tanto items sueltos como grupos
type SidebarEntry = SidebarItem | SidebarGroup;

// Type guard para diferenciar grupos de items
function isSidebarGroup(entry: SidebarEntry): entry is SidebarGroup {
  return (entry as SidebarGroup).groupLabel !== undefined;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { userInfo } = useAuth();

  // Definimos la estructura completa requerida
  const rawSidebarEntries: SidebarEntry[] = [
    { title: 'Dashboard', href: '/', icon: LayoutDashboard, screenName: 'Dashboard' },
    {
      groupLabel: 'Comercial',
      items: [
        { title: 'Objetivos', href: '/objectives', icon: Crosshair, screenName: 'Objectives' },
        { title: 'Oportunidades', href: '/opportunities', icon: Trophy, screenName: 'Opportunities' },
        { title: 'Prospectos', href: '/prospects', icon: Target, screenName: 'Prospects' },
        { title: 'Clientes', href: '/clients', icon: Users, screenName: 'Clients' },
        { title: 'Canjes', href: '/canjes', icon: Repeat, screenName: 'Canjes' },
        { title: 'Cotizador', href: '/quotes', icon: FileSpreadsheet, screenName: 'Quotes' },
        { title: 'Aprobaciones', href: '/approvals', icon: CheckSquare, screenName: 'Approvals' },
        { title: 'Seguimiento', href: '/coaching', icon: ClipboardList, screenName: 'Coaching' },
      ]
    },
    {
      groupLabel: 'Programación',
      items: [
        { title: 'Grilla', href: '/grilla', icon: Radio, screenName: 'Grilla' },
        { title: 'PNTs', href: '/pnts', icon: Megaphone, screenName: 'PNTs' },
      ]
    },
    { title: 'Calendario', href: '/calendar', icon: Calendar, screenName: 'Calendar' },
    { title: 'Chat', href: '/chat', icon: MessageSquare, screenName: 'Chat' },
    {
      groupLabel: 'Contable',
      items: [
        { title: 'Cobranzas', href: '/billing', icon: DollarSign, screenName: 'Billing' }, // Renombrado de Facturación
        { title: 'Facturas', href: '/invoices', icon: FileText, screenName: 'Invoices' },
      ]
    },
    {
      groupLabel: 'RRHH',
      items: [
        { title: 'Licencias', href: '/licencias', icon: Palmtree, screenName: 'Licenses' },
      ]
    },
    {
      groupLabel: 'Administración',
      items: [
        { title: 'Tarifas', href: '/rates', icon: BadgePercent, screenName: 'Rates' },
        { title: 'Equipo', href: '/team', icon: Users2, screenName: 'Team' },
        { title: 'Reportes', href: '/reports', icon: BarChart3, screenName: 'Reports' },
        { title: 'Importar', href: '/import', icon: Upload, screenName: 'Import' },
        { title: 'Mapeo Tango', href: '/tango-mapping', icon: Database, screenName: 'TangoMapping' },
        { title: 'Actividad', href: '/activity', icon: Activity, screenName: 'Activity' },
      ]
    },
  ];

  // Filtramos los items basándonos en permisos
  const filteredEntries = useMemo(() => {
    if (!userInfo) return [];

    const hasPermission = (item: SidebarItem) => {
      // Super admin ve todo
      if (userInfo.email === 'lchena@airedesantafe.com.ar') return true;
      
      // Chequeo de permisos standard
      if (userInfo.permissions) {
        const permission = userInfo.permissions[item.screenName];
        return permission?.view;
      }
      return true;
    };

    return rawSidebarEntries.reduce<SidebarEntry[]>((acc, entry) => {
      if (isSidebarGroup(entry)) {
        // Es un grupo: filtramos sus hijos
        const visibleItems = entry.items.filter(hasPermission);
        if (visibleItems.length > 0) {
          acc.push({ ...entry, items: visibleItems });
        }
      } else {
        // Es un item suelto
        if (hasPermission(entry)) {
          acc.push(entry);
        }
      }
      return acc;
    }, []);
  }, [userInfo]);

  // Determinamos qué grupo debe estar abierto por defecto según la URL actual
  const activeGroup = useMemo(() => {
    for (const entry of filteredEntries) {
      if (isSidebarGroup(entry)) {
        if (entry.items.some(item => pathname === item.href)) {
          return entry.groupLabel;
        }
      }
    }
    return undefined;
  }, [pathname, filteredEntries]);

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
            
            <Accordion 
              type="single" 
              collapsible 
              className="w-full space-y-1" 
              defaultValue={activeGroup}
            >
              {filteredEntries.map((entry, index) => {
                if (isSidebarGroup(entry)) {
                  // Renderizar Grupo (Accordion)
                  return (
                    <AccordionItem value={entry.groupLabel} key={entry.groupLabel} className="border-none">
                      <AccordionTrigger className="flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-white hover:no-underline transition-all [&[data-state=open]]:text-white">
                        <span className="flex-1 text-left">{entry.groupLabel}</span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-1 pt-1 ml-2 border-l border-zinc-800">
                        {entry.items.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={cn(
                              "flex items-center gap-3 rounded-r-lg px-3 py-2 transition-all mb-1 text-sm",
                              pathname === subItem.href
                                ? "bg-zinc-800/50 text-white border-l-2 border-primary -ml-[1px]"
                                : "text-zinc-400 hover:text-white hover:bg-zinc-800/30"
                            )}
                          >
                            <subItem.icon className="h-4 w-4 shrink-0" />
                            {subItem.title}
                          </Link>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                } else {
                  // Renderizar Item Suelto (Link directo)
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
                        pathname === entry.href
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      )}
                    >
                      <entry.icon className="h-4 w-4 shrink-0" />
                      {entry.title}
                    </Link>
                  );
                }
              })}
            </Accordion>

          </nav>
        </ScrollArea>
      </div>
    </div>
  );
}
