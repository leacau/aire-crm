

import type { User, AreaType, ScreenName, ScreenPermission } from './types';
import { getAreaPermissions } from './firebase-service';
import { defaultPermissions } from './data';

// In-memory cache for permissions
let permissionsCache: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>> | null = null;

/**
 * Initializes and populates the permissions cache.
 * THIS SHOULD ONLY BE CALLED FROM THE SERVER.
 */
async function initializePermissionsCache() {
    try {
        permissionsCache = await getAreaPermissions();
    } catch (error) {
        console.error("Failed to initialize permissions cache, falling back to defaults:", error);
        permissionsCache = defaultPermissions;
    }
}

/**
 * Invalidates the in-memory cache for permissions.
 * Should be called after updating permissions in the database.
 */
export function invalidatePermissionsCache() {
    permissionsCache = null;
    // Re-initialize after invalidation
    initializePermissionsCache();
}

/**
 * Checks if a user has a specific permission for a screen using the in-memory cache.
 * This is a synchronous function intended for use in client components.
 * 
 * @param user The user object.
 * @param screen The screen to check permission for.
 * @param permissionType The type of permission ('view' or 'edit').
 * @returns true if the user has the permission, false otherwise.
 */
export function hasPermission(user: User, screen: ScreenName, permissionType: 'view' | 'edit'): boolean {
     if (!user) {
        return false;
    }
    
    // Superusers have all permissions. Use a specific, non-public email for the super admin.
    if (user.role === 'Jefe' || user.role === 'Gerencia' || user.email === 'lchena@airedesantafe.com.ar') {
        return true;
    }

    // User-specific overrides
    if (user.permissions && user.permissions[screen]) {
        const hasPermission = user.permissions[screen]![permissionType] === true;
        // If edit is true, view must also be true
        if (permissionType === 'view' && user.permissions[screen]!.edit === true) {
            return true;
        }
        return hasPermission;
    }

    // Area-based permissions from cache
    const areaPerms = permissionsCache || defaultPermissions;

    if (user.area && areaPerms[user.area] && areaPerms[user.area][screen]) {
        const hasAreaPermission = areaPerms[user.area][screen]![permissionType] === true;
        // If edit is true, view must also be true
        if (permissionType === 'view' && areaPerms[user.area][screen]!.edit === true) {
            return true;
        }
        return hasAreaPermission;
    }

    return false;
}

// Initial fetch to populate cache on app load (server-side).
initializePermissionsCache();