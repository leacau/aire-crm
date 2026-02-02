'use client';

import * as React from 'react';
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
  ClipboardList,
  Briefcase,
  Layers,
  Calculator,
  UserCog,
  Settings2,
  ChevronRight,
  ShieldCheck,
  Scale,
  ListTodo,
  StickyNote
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';

// Importamos los componentes de UI
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ScreenName } from '@/lib/types';
import { hasManagementPrivileges } from '@/lib/role-utils';

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ElementType;
  screenName: ScreenName;
}

interface SidebarGroup {
  groupLabel: string;
  icon: React.ElementType;
  items: SidebarItem[];
}

type SidebarEntry = SidebarItem | SidebarGroup;

function isSidebarGroup(entry: SidebarEntry): entry is SidebarGroup {
  return (entry as SidebarGroup).groupLabel !== undefined;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { userInfo } = useAuth();
  const { state } = useSidebar();
  
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const rawSidebarEntries: SidebarEntry[] = [
    { title: 'Dashboard', href: '/', icon: LayoutDashboard, screenName: 'Dashboard' },
    {
      groupLabel: 'Comercial',
      icon: Briefcase,
      items: [
        { title: 'Objetivos', href: '/objectives', icon: Crosshair, screenName: 'Objectives' },
        { title: 'Clientes', href: '/clients', icon: Users, screenName: 'Clients' },
        { title: 'Oportunidades', href: '/opportunities', icon: Trophy, screenName: 'Opportunities' },
        { title: 'Prospectos', href: '/prospects', icon: Target, screenName: 'Prospects' },
        { title: 'Tareas', href: '/tasks', icon: ListTodo, screenName: 'Tasks' },
        { title: 'Canjes', href: '/canjes', icon: Repeat, screenName: 'Canjes' },
        { title: 'Cotizador', href: '/quotes', icon: FileSpreadsheet, screenName: 'Quotes' },
        { title: 'Aprobaciones', href: '/approvals', icon: CheckSquare, screenName: 'Approvals' },
        { title: 'Seguimiento', href: '/coaching', icon: ClipboardList, screenName: 'Coaching' },
      ]
    },
    {
      groupLabel: 'Programación',
      icon: Layers,
      items: [
        { title: 'Grilla', href: '/grilla', icon: Radio, screenName: 'Grilla' },
        { title: 'PNTs', href: '/pnts', icon: Megaphone, screenName: 'PNTs' },
        { title: 'Nota Comercial', href: '/notas', icon: StickyNote, screenName: 'Notas' },
      ]
    },
    { title: 'Calendario', href: '/calendar', icon: Calendar, screenName: 'Calendar' },
    { title: 'Chat', href: '/chat', icon: MessageSquare, screenName: 'Chat' },
    {
      groupLabel: 'Contable',
      icon: Calculator,
      items: [
        { title: 'Cobranzas', href: '/billing', icon: DollarSign, screenName: 'Billing' },
        { title: 'Facturas', href: '/invoices', icon: FileText, screenName: 'Invoices' },
      ]
    },
    {
      groupLabel: 'RRHH',
      icon: UserCog,
      items: [
        { title: 'Licencias', href: '/licencias', icon: Palmtree, screenName: 'Licenses' },
      ]
    },
    {
      groupLabel: 'Administración',
      icon: Settings2,
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

  const filteredEntries = useMemo(() => {
    if (!userInfo) return [];

    const hasPermission = (item: SidebarItem) => {
      // 1. Super Admin siempre tiene acceso
      if (userInfo.email === 'lchena@airedesantafe.com.ar') return true;
      if (userInfo.role === 'Admin') return true;

      // 2. Dashboard siempre visible
      if (item.screenName === 'Dashboard') return true;

      // 3. Chequeo de Permisos Explícitos
      if (userInfo.permissions && Object.keys(userInfo.permissions).length > 0) {
        return !!userInfo.permissions[item.screenName]?.view;
      }
      
      // 4. Lógica de Respaldo (Fallback) si no hay objeto permissions
      // Esto restaura el acceso a los Asesores que no tienen permisos configurados en la DB
      if (userInfo.role === 'Asesor') {
        const allowedScreens: ScreenName[] = [
          'Objectives', 'Clients', 'Opportunities', 'Prospects', 'Tasks', 
          'Canjes', 'Quotes', 'Grilla', 'PNTs', 'Notas', 
          'Calendar', 'Chat', 'Billing', 'Invoices', 'Licenses'
        ];
        return allowedScreens.includes(item.screenName);
      }

      // Si es Jefe, Gerencia o Administración y no tiene permisos, mostrar todo por defecto
      if (hasManagementPrivileges(userInfo) || userInfo.role === 'Administracion') {
        return true;
      }

      return false; 
    };

    return rawSidebarEntries.reduce<SidebarEntry[]>((acc, entry) => {
      if (isSidebarGroup(entry)) {
        const visibleItems = entry.items.filter(hasPermission);
        if (visibleItems.length > 0) {
          acc.push({ ...entry, items: visibleItems });
        }
      } else if (hasPermission(entry)) {
        acc.push(entry);
      }
      return acc;
    }, []);
  }, [userInfo]);

  useEffect(() => {
    if (state === 'collapsed') return; 
    
    const activeGroup = filteredEntries.find(entry => 
      isSidebarGroup(entry) && entry.items.some(item => pathname === item.href)
    );
    
    if (activeGroup && isSidebarGroup(activeGroup)) {
      setOpenGroup(activeGroup.groupLabel);
    }
  }, [pathname, filteredEntries, state]);

  const handleGroupClick = (label: string) => {
    setOpenGroup(prev => prev === label ? null : label);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-[60px] items-center px-4 shrink-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center overflow-hidden">
          <Link href="/" className="flex items-center gap-2 font-semibold transition-all">
            <Logo isInSidebar={true} />
          </Link>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarMenu>
          {filteredEntries.map((entry) => {
            if (isSidebarGroup(entry)) {
              const isActive = entry.items.some(item => pathname === item.href);
              const isOpen = openGroup === entry.groupLabel;

              if (state === 'collapsed') {
                return (
                  <SidebarMenuItem key={entry.groupLabel}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton 
                          tooltip={entry.groupLabel} 
                          isActive={isActive}
                          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                          <entry.icon />
                          <span>{entry.groupLabel}</span>
                          <ChevronRight className="ml-auto size-4" />
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="min-w-56 rounded-lg bg-zinc-950 border-zinc-800 text-zinc-100">
                        <DropdownMenuLabel className="text-zinc-400">{entry.groupLabel}</DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        {entry.items.map((subItem) => (
                          <DropdownMenuItem key={subItem.href} asChild className="focus:bg-zinc-800 focus:text-zinc-100">
                            <Link href={subItem.href} className="flex items-center gap-2 cursor-pointer">
                              <subItem.icon className="size-4 text-zinc-400" />
                              <span>{subItem.title}</span>
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                );
              }

              return (
                <Collapsible
                  key={entry.groupLabel}
                  asChild
                  open={isOpen}
                  onOpenChange={() => handleGroupClick(entry.groupLabel)}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton 
                        tooltip={entry.groupLabel} 
                        isActive={isActive}
                      >
                        <entry.icon />
                        <span>{entry.groupLabel}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {entry.items.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.href}>
                            <SidebarMenuSubButton 
                              asChild 
                              isActive={pathname === subItem.href}
                            >
                              <Link href={subItem.href}>
                                <subItem.icon className="size-4" />
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            }

            return (
              <SidebarMenuItem key={entry.href}>
                <SidebarMenuButton 
                  asChild 
                  tooltip={entry.title} 
                  isActive={pathname === entry.href}
                >
                  <Link href={entry.href}>
                    <entry.icon />
                    <span>{entry.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Políticas de Privacidad" className="text-xs text-muted-foreground hover:text-foreground">
              <Link href="/privacy-policy">
                <ShieldCheck className="size-4" />
                <span>Privacidad</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Términos del Servicio" className="text-xs text-muted-foreground hover:text-foreground">
              <Link href="/terms-of-service">
                <Scale className="size-4" />
                <span>Términos</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
