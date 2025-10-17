

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
import { Home, CircleDollarSign, Users, Settings, Receipt, BarChart, LayoutList, CheckSquare, Calendar, Upload, Repeat, Banknote } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

const menuItems = [
  { href: '/', label: 'Panel', icon: Home, roles: ['Jefe', 'Gerencia', 'Asesor', 'Administracion'] },
  { href: '/opportunities', label: 'Oportunidades', icon: CircleDollarSign, roles: ['Jefe', 'Gerencia', 'Asesor', 'Administracion'] },
  { href: '/clients', label: 'Clientes', icon: Users, roles: ['Jefe', 'Gerencia', 'Asesor', 'Administracion'] },
  { href: '/canjes', label: 'Canjes', icon: Repeat, roles: ['Jefe', 'Gerencia', 'Asesor', 'Administracion'] },
  { href: '/invoices', label: 'Facturación', icon: Receipt, roles: ['Jefe', 'Gerencia', 'Asesor', 'Administracion'] },
  { href: '/billing', label: 'Cobranzas', icon: Banknote, roles: ['Jefe', 'Gerencia', 'Asesor', 'Administracion'] },
  { href: '/calendar', label: 'Calendario', icon: Calendar, roles: ['Jefe', 'Gerencia', 'Asesor', 'Administracion'] },
  { href: '/approvals', label: 'Aprobaciones', icon: CheckSquare, roles: ['Jefe', 'Gerencia'] },
  { href: '/activity', label: 'Actividad', icon: LayoutList, roles: ['Jefe', 'Gerencia'] },
  { href: '/team', label: 'Equipo', icon: Users, roles: ['Jefe', 'Gerencia'] },
  { href: '/reports', label: 'Reportes', icon: BarChart, roles: ['Jefe', 'Gerencia'] },
  { href: '/import', label: 'Importar', icon: Upload, roles: ['Jefe', 'Gerencia', 'Administracion'] },
];

function MenuLink({ item }: { item: typeof menuItems[0] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    // Exact match for /billing, otherwise prefix match
    if (href === '/billing') return pathname === '/billing';
    if (href === '/invoices') return pathname === '/invoices';
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

  const accessibleItems = menuItems.filter(item => item.roles.includes(userInfo.role));

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
