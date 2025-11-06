

import type { User, ScreenName } from './types';

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

    // If 'edit' permission is requested, it implicitly requires 'view' permission.
    // If 'edit' is true, grant permission.
    if (permissionType === 'edit') {
        return screenPermissions.edit === true;
    }

    // If 'view' permission is requested, grant if 'view' is true OR if 'edit' is true (since edit implies view).
    if (permissionType === 'view') {
        return screenPermissions.view === true || screenPermissions.edit === true;
    }

    return false;
}
