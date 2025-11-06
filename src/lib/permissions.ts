
import type { User, ScreenName } from './types';
import { defaultPermissions } from '@/lib/data';

// This is now just a placeholder for the logic inside useAuth.
// The actual permissions are attached to the user object.
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
