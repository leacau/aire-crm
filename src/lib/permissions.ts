
import type { User, ScreenName, AreaType, ScreenPermission } from './types';
import { defaultPermissions } from '@/lib/data';
import { getAreaPermissions } from '@/lib/firebase-service';

type PermissionsMap = Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;

let permissionsCache: PermissionsMap | null = null;
let initializationPromise: Promise<void> | null = null;

async function initializePermissionsCache() {
    if (!initializationPromise) {
        initializationPromise = (async () => {
            try {
                permissionsCache = await getAreaPermissions();
            } catch (error) {
                console.error('Failed to initialize permissions cache, falling back to defaults:', error);
                permissionsCache = defaultPermissions;
            }
        })();
    }

    return initializationPromise;
}

export function invalidateCache() {
    permissionsCache = null;
    initializationPromise = null;
    void initializePermissionsCache();
}

export function hasPermission(user: User, screen: ScreenName, permissionType: 'view' | 'edit'): boolean {
    if (!user) {
        return false;
    }

    // Superusers have all permissions. Use a specific, non-public email for the super admin.
    if (user.role === 'Jefe' || user.role === 'Gerencia' || user.email === 'lchena@airedesantafe.com.ar') {
        return true;
    }

    // User-specific overrides
    const screenPermissions = user.permissions?.[screen];
    if (screenPermissions) {
        if (permissionType === 'view' && screenPermissions.edit === true) {
            return true;
        }

        return screenPermissions[permissionType] === true;
    }

    // Ensure the cache is warming up in the background.
    void initializePermissionsCache();

    const areaPermissions = permissionsCache || defaultPermissions;
    if (user.area) {
        const areaPerms = areaPermissions[user.area];
        const areaScreenPerms = areaPerms?.[screen];

        if (areaScreenPerms) {
            if (permissionType === 'view' && areaScreenPerms.edit === true) {
                return true;
            }

            return areaScreenPerms[permissionType] === true;
        }
    }

    return false;
}

// Trigger an initial fetch so the cache is ready ASAP (non-blocking).
void initializePermissionsCache();
