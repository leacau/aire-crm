

import type { User, AreaType, ScreenName, ScreenPermission } from './types';
import { getAreaPermissions } from './firebase-service';
import { defaultPermissions } from './data';
import { hasManagementPrivileges } from './role-utils';

// In-memory cache for permissions
let permissionsCache: Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>> | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes


/**
 * Fetches permissions from Firestore or returns from cache.
 */
async function getPermissions() {
    const now = Date.now();
    if (permissionsCache && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION_MS)) {
        return permissionsCache;
    }
    
    try {
        permissionsCache = await getAreaPermissions();
        cacheTimestamp = now;
        return permissionsCache;
    } catch (error) {
        console.error("Failed to initialize permissions cache, falling back to defaults:", error);
        permissionsCache = defaultPermissions; // Fallback to default permissions on error
        cacheTimestamp = now;
        return permissionsCache;
    }
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
 * This is the synchronous version for client components that relies on the cache.
 * It might show stale data for up to CACHE_DURATION_MS but avoids async logic in components.
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
    
    // Superusers and management roles have all permissions.
    if (hasManagementPrivileges(user)) {
        return true;
    }

    // User-specific overrides (if they exist) take precedence.
    if (user.permissions && user.permissions[screen]) {
        return user.permissions[screen]![permissionType] === true;
    }

    // Fallback to area-based permissions from the cache.
    const areaPerms = permissionsCache || defaultPermissions;

    if (user.area && areaPerms[user.area] && areaPerms[user.area][screen]) {
        return areaPerms[user.area][screen]![permissionType] === true;
    }

    // Default to no permission if none of the above match.
    return false;
}

// Initial fetch to populate cache on app load.
getPermissions();
