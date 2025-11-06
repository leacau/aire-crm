
import type { User, ScreenName } from './types';
import { defaultPermissions } from '@/lib/data';

/**
 * Checks if a user has a specific permission for a screen.
 * This is a synchronous function that relies on the permissions being pre-loaded into the user object.
 * 
 * @param user The user object, which should contain the resolved permissions.
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

    const screenPermissions = user.permissions?.[screen];

    if (!screenPermissions) {
        return false;
    }

    // If 'edit' is true, view is implicitly true.
    if (permissionType === 'view' && screenPermissions.edit === true) {
        return true;
    }

    return screenPermissions[permissionType] === true;
}

/**
 * This function is deprecated and should not be used. It's a placeholder to avoid breaking changes.
 */
export function invalidateCache() {
    // No-op
}
