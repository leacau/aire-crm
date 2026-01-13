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
  MoreHorizontal
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';

// Importamos los componentes de UI del Sidebar
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

// Componentes para el comportamiento de acordeón
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Componentes para el menú desplegable en modo colapsado
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ScreenName } from '@/lib/types';

interface SidebarItem {
  title: string;
  href: string;
  icon: React.ElementType;
  screenName: ScreenName;
}

interface SidebarGroup {
  groupLabel: string;
  icon: React.ElementType; // Agregamos icono al grupo para el modo colapsado
  items: SidebarItem[];
}

type SidebarEntry = SidebarItem | SidebarGroup;

function isSidebarGroup(entry: SidebarEntry): entry is SidebarGroup {
  return (entry as SidebarGroup).groupLabel !== undefined;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { userInfo } = useAuth();
  const { state, isMobile } = useSidebar();
  
  // Estado para controlar qué grupo del acordeón está abierto
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Definición de la estructura del menú
  const rawSidebarEntries: SidebarEntry[] = [
    { title: 'Dashboard', href: '/', icon: LayoutDashboard, screenName: 'Dashboard' },
    {
      groupLabel: 'Comercial',
      icon: Briefcase,
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
      icon: Layers,
      items: [
        { title: 'Grilla', href: '/grilla', icon: Radio, screenName: 'Grilla' },
        { title: 'PNTs', href: '/pnts', icon: Megaphone, screenName: 'PNTs' },
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

  // Filtrado de permisos
  const filteredEntries = useMemo(() => {
    if (!userInfo) return [];
    const hasPermission = (item: SidebarItem) => {
      if (userInfo.email === 'lchena@airedesantafe.com.ar') return true;
      if (userInfo.permissions) {
        return userInfo.permissions[item.screenName]?.view;
      }
      return true;
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

  // Abrir automáticamente el grupo activo al cargar
  useEffect(() => {
    if (state === 'collapsed') return; 
    
    const activeGroup = filteredEntries.find(entry => 
      isSidebarGroup(entry) && entry.items.some(item => pathname === item.href)
    );
    
    if (activeGroup && isSidebarGroup(activeGroup)) {
      setOpenGroup(activeGroup.groupLabel);
    }
  }, [pathname, filteredEntries, state]);

  // Función para manejar el comportamiento de acordeón
  const handleGroupClick = (label: string) => {
    setOpenGroup(prev => prev === label ? null : label);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-[60px] items-center px-4 shrink-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center overflow-hidden">
          <Link href="/" className="flex items-center gap-2 font-semibold transition-all">
            {/* Asumiendo que Logo maneja su tamaño o le pasamos una prop si es necesario.
                En modo icono, el contenedor lo cortará si es muy ancho, 
                idealmente el componente Logo debería adaptarse */}
            <Logo isInSidebar={true} />
          </Link>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarMenu>
          {filteredEntries.map((entry) => {
            // --- RENDERIZADO DE GRUPOS ---
            if (isSidebarGroup(entry)) {
              const isActive = entry.items.some(item => pathname === item.href);
              const isOpen = openGroup === entry.groupLabel;

              // Si el sidebar está colapsado, usamos DropdownMenu para mostrar los subitems
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

              // Si el sidebar está expandido, usamos Collapsible (Acordeón)
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
                        isActive={isActive} // Resalta el padre si un hijo está activo
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

            // --- RENDERIZADO DE ITEMS SIMPLES ---
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
        {/* Aquí puedes poner componentes de usuario o ajustes si lo deseas */}
      </SidebarFooter>
      
      <SidebarRail />
    </Sidebar>
  );
}
