'use client';
import { Logo } from '@/components/logo';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
  SidebarTrigger,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Home, CircleDollarSign, Users, Settings, Receipt, BarChart, LayoutList, CheckSquare, Calendar, Upload, Repeat, Banknote, Grid3X3, Megaphone, Lightbulb, ClipboardCheck, Target, MessageCircle, Building2, Calculator } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import type { ScreenName } from '@/lib/types';
import { hasPermission } from '@/lib/permissions';

const menuItems: { href: string; label: string; icon: React.ElementType, screenName: ScreenName }[] = [
  { href: '/', label: 'Panel', icon: Home, screenName: 'Dashboard' },
  { href: '/objectives', label: 'Objetivos', icon: Target, screenName: 'Objectives' },
  { href: '/opportunities', label: 'Oportunidades', icon: CircleDollarSign, screenName: 'Opportunities' },
  { href: '/prospects', label: 'Prospectos', icon: Lightbulb, screenName: 'Prospects' },
  { href: '/clients', label: 'Clientes', icon: Users, screenName: 'Clients' },
  { href: '/grilla', label: 'Grilla', icon: Grid3X3, screenName: 'Grilla' },
  { href: '/pnts', label: 'PNTs', icon: Megaphone, screenName: 'PNTs' },
  { href: '/canjes', label: 'Canjes', icon: Repeat, screenName: 'Canjes' },
  { href: '/invoices', label: 'Facturación', icon: Receipt, screenName: 'Invoices' },
  { href: '/billing', label: 'Cobranzas', icon: Banknote, screenName: 'Billing' },
  { href: '/calendar', label: 'Calendario', icon: Calendar, screenName: 'Calendar' },
  { href: '/licencias', label: 'Licencias', icon: ClipboardCheck, screenName: 'Licenses' },
  { href: '/approvals', label: 'Aprobaciones', icon: CheckSquare, screenName: 'Approvals' },
  { href: '/activity', label: 'Actividad', icon: LayoutList, screenName: 'Activity' },
  { href: '/chat', label: 'Chat', icon: MessageCircle, screenName: 'Chat' },
  { href: '/tango-mapping', label: 'Tango', icon: Building2, screenName: 'TangoMapping' },
  { href: '/team', label: 'Equipo', icon: Users, screenName: 'Team' },
  { href: '/rates', label: 'Tarifas', icon: Banknote, screenName: 'Rates' },
  { href: '/quotes', label: 'Cotizador', icon: Calculator, screenName: 'Quotes' },
  { href: '/reports', label: 'Reportes', icon: BarChart, screenName: 'Reports' },
  { href: '/import', label: 'Importar', icon: Upload, screenName: 'Import' },
];

function MenuLink({ item }: { item: typeof menuItems[0] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    // Exact match for specific routes, otherwise prefix match
    const exactMatchRoutes = ['/billing', '/invoices', '/rates', '/licencias', '/objectives', '/quotes'];
    if (exactMatchRoutes.includes(href)) return pathname === href;
    
    return pathname.startsWith(href) && href !== '/';
  };

  return (
    <SidebarMenuButton
      asChild
      isActive={isActive(item.href)}
      tooltip={{ children: item.label, side: 'right' }}
      onClick={() => setOpenMobile(false)}
      size="lg"
    >
      <Link href={item.href}>
        <item.icon />
        <span>{item.label}</span>
      </Link>
    </SidebarMenuButton>
  );
}


export function AppSidebar() {
  const { userInfo } = useAuth();
  
  if (!userInfo) return null;

  const accessibleItems = menuItems
    .filter(item => hasPermission(userInfo, item.screenName, 'view'))
    .filter(item => {
      if (userInfo.role === 'Asesor' && item.href === '/objectives') {
        return false;
      }
      return true;
    });

  return (
    <Sidebar collapsible="icon">
        <SidebarRail />
      <SidebarHeader>
        <Logo isInSidebar={true} />
        <SidebarTrigger className="ml-auto hidden data-[state=expanded]:md:flex" />
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <div className="py-2" />
        <SidebarMenu>
          {accessibleItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <MenuLink item={item} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
      </SidebarFooter>
    </Sidebar>
  );
}
