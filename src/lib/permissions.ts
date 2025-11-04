

import type { User, AreaType, ScreenName, ScreenPermission } from './types';
import { getAreaPermissions } from './firebase-service';

// In-memory cache for permissions
let permissionsCache: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>> | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Default permissions for each area, used as a fallback or for seeding the database
export const defaultPermissions: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>> = {
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
    'Recursos Humanos': {
        Licenses: { view: true, edit: true },
        Canjes: { view: true, edit: true },
        Team: { view: true, edit: true },
    },
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
 * Fetches permissions from Firestore or returns from cache.
 */
async function getPermissions() {
    const now = Date.now();
    if (permissionsCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION_MS)) {
        return permissionsCache;
    }
    
    permissionsCache = await getAreaPermissions();
    cacheTimestamp = now;
    return permissionsCache;
}


/**
 * Invalidates the in-memory cache for permissions.
 * Should be called after updating permissions in the database.
 */
export function invalidatePermissionsCache() {
    permissionsCache = null;
    cacheTimestamp = null;
}

/**
 * Checks if a user has a specific permission for a screen.
 * 
 * Hierarchy of checks:
 * 1. User is 'Jefe', 'Gerencia', or 'Admin' -> always true (superuser).
 * 2. User has specific permission defined on their own profile -> use that.
 * 3. User's area has a specific permission defined -> use that.
 * 4. Default to false if no permission is found.
 * 
 * @param user The user object.
 * @param screen The screen to check permission for.
 * @param permissionType The type of permission ('view' or 'edit').
 * @returns A promise that resolves to true if the user has the permission, false otherwise.
 */
export async function hasPermissionAsync(user: User, screen: ScreenName, permissionType: 'view' | 'edit'): Promise<boolean> {
    if (!user) {
        return false;
    }

    // Superusers have all permissions
    if (user.role === 'Jefe' || user.role === 'Gerencia' || user.email === 'lchena@airedesantafe.com.ar') {
        return true;
    }
    
    // User-specific overrides
    if (user.permissions && user.permissions[screen]) {
        return user.permissions[screen]![permissionType] === true;
    }

    // Area-based permissions
    const areaPerms = await getPermissions();

    if (user.area && areaPerms[user.area] && areaPerms[user.area][screen]) {
        return areaPerms[user.area][screen]![permissionType] === true;
    }

    return false;
}


// A synchronous version for client components that rely on the cache.
// This might show stale data for up to CACHE_DURATION_MS but avoids async logic in components.
export function hasPermission(user: User, screen: ScreenName, permissionType: 'view' | 'edit'): boolean {
     if (!user) {
        return false;
    }
    
    // Superusers have all permissions
    if (user.role === 'Jefe' || user.role === 'Gerencia' || user.email === 'lchena@airedesantafe.com.ar') {
        return true;
    }

    // User-specific overrides
    if (user.permissions && user.permissions[screen]) {
        return user.permissions[screen]![permissionType] === true;
    }

    // Area-based permissions from cache
    const areaPerms = permissionsCache || defaultPermissions;

    if (user.area && areaPerms[user.area] && areaPerms[user.area][screen]) {
        return areaPerms[user.area][screen]![permissionType] === true;
    }

    return false;
}

// Initial fetch to populate cache on app load.
getPermissions();
