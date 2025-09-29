
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
} from '@/components/ui/sidebar';
import { Home, CircleDollarSign, Users, Settings, Receipt, BarChart, LayoutList, CheckSquare } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

const menuItems = [
  { href: '/', label: 'Panel', icon: Home, roles: ['Jefe', 'Asesor', 'Administracion'] },
  { href: '/opportunities', label: 'Oportunidades', icon: CircleDollarSign, roles: ['Jefe', 'Asesor', 'Administracion'] },
  { href: '/clients', label: 'Clientes', icon: Users, roles: ['Jefe', 'Asesor', 'Administracion'] },
  { href: '/billing', label: 'Facturación', icon: Receipt, roles: ['Jefe', 'Asesor', 'Administracion'] },
  { href: '/approvals', label: 'Aprobaciones', icon: CheckSquare, roles: ['Jefe'] },
  { href: '/activity', label: 'Actividad', icon: LayoutList, roles: ['Jefe'] },
  { href: '/team', label: 'Equipo', icon: Users, roles: ['Jefe'] },
  { href: '/reports', label: 'Reportes', icon: BarChart, roles: ['Jefe'] },
];

function MenuLink({ item }: { item: typeof menuItems[0] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <SidebarMenuButton
      asChild
      isActive={isActive(item.href)}
      tooltip={{ children: item.label, side: 'right' }}
      onClick={() => setOpenMobile(false)}
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
      <SidebarContent>
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
