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
} from '@/components/ui/sidebar';
import { Home, Kanban, Users, Settings, LifeBuoy } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const menuItems = [
  { href: '/', label: 'Panel', icon: Home },
  { href: '/opportunities', label: 'Oportunidades', icon: Kanban },
  { href: '/clients', label: 'Clientes', icon: Users },
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
  return (
    <Sidebar>
      <SidebarHeader>
        <Logo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <MenuLink item={item} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
           <SidebarMenuItem>
            <SidebarMenuButton tooltip={{ children: 'Ajustes', side: 'right' }}>
              <Settings />
              <span>Ajustes</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={{ children: 'Soporte', side: 'right' }}>
              <LifeBuoy />
              <span>Soporte</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
