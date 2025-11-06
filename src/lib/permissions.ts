
import type { User, ScreenName } from './types';
import { defaultPermissions } from '@/lib/data';

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

export function invalidateCache() {
    // No-op. Permissions are now loaded with the user profile.
}
