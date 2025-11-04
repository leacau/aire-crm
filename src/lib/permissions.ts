
import type { User, AreaType, ScreenName, ScreenPermission } from './types';

// Default permissions for each area
const areaPermissions: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>> = {
    // Acceso total
    'Comercial': {
        Dashboard: { view: true, edit: true },
        Opportunities: { view: true, edit: true },
        Prospects: { view: true, edit: true },
        Clients: { view: true, edit: true },
        Grilla: { view: true, edit: true },
        PNTs: { view: true, edit: true },
        Canjes: { view: true, edit: true },
        Invoices: { view: true, edit: true },
        Billing: { view: true, edit: true },
        Calendar: { view: true, edit: true },
        Licenses: { view: true, edit: true },
        Approvals: { view: true, edit: true },
        Activity: { view: true, edit: true },
        Team: { view: true, edit: true },
        Rates: { view: true, edit: true },
        Reports: { view: true, edit: true },
        Import: { view: true, edit: true },
    },
    // Acceso a licencias y canjes
    'Recursos Humanos': {
        Licenses: { view: true, edit: true },
        Canjes: { view: true, edit: true },
        Team: { view: true, edit: true },
    },
    // Acceso a clientes, oportunidades, pnt, grilla
    'Pautado': {
        Clients: { view: true, edit: false },
        Opportunities: { view: true, edit: false },
        PNTs: { view: true, edit: true },
        Grilla: { view: true, edit: true },
    },
    'Administración': {
        Dashboard: { view: true, edit: true },
        Opportunities: { view: true, edit: true },
        Clients: { view: true, edit: true },
        Canjes: { view: true, edit: true },
        Invoices: { view: true, edit: true },
        Billing: { view: true, edit: true },
        Team: { view: true, edit: true },
        Rates: { view: true, edit: true },
        Reports: { view: true, edit: true },
        Import: { view: true, edit: true },
    },
    'Programación': {
        Grilla: { view: true, edit: false },
        PNTs: { view: true, edit: false },
    },
    'Redacción': {
         PNTs: { view: true, edit: false },
    }
};

/**
 * Checks if a user has a specific permission for a screen.
 * 
 * Hierarchy of checks:
 * 1. User is 'Jefe' or 'Gerencia' -> always true (superuser).
 * 2. User has specific permission defined on their own profile -> use that.
 * 3. User's area has a specific permission defined -> use that.
 * 4. Default to false if no permission is found.
 * 
 * @param user The user object.
 * @param screen The screen to check permission for.
 * @param permissionType The type of permission ('view' or 'edit').
 * @returns True if the user has the permission, false otherwise.
 */
export function hasPermission(user: User, screen: ScreenName, permissionType: 'view' | 'edit'): boolean {
    if (!user) {
        return false;
    }
    
    // Super-admin roles have access to everything.
    if (user.role === 'Jefe' || user.role === 'Gerencia' || user.role === 'Admin') {
        return true;
    }

    // 1. Check for user-specific permissions (overrides area permissions)
    if (user.permissions && user.permissions[screen]) {
        return user.permissions[screen]![permissionType] === true;
    }

    // 2. Check for area-based permissions
    if (user.area && areaPermissions[user.area] && areaPermissions[user.area][screen]) {
        return areaPermissions[user.area][screen]![permissionType] === true;
    }

    // 3. Default to no permission
    return false;
}
