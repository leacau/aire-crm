export const SUPER_ADMIN_EMAIL = 'lchena@airedesantafe.com.ar';

const MANAGEMENT_ROLE_PATTERN = /(jef(e|a|atura)|gerenc|gerent|administrac|administrador|admin\b|coordinac|coordinador|direcc|director|lider|líder|leader|supervis|responsabl|encargad)/;

function normalizeRoleName(role: string): string {
    return role
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
}

export function isManagementRoleName(role?: string | null): boolean {
    if (!role || typeof role !== 'string') {
        return false;
    }

    const normalized = normalizeRoleName(role);

    return MANAGEMENT_ROLE_PATTERN.test(normalized);
}

export function isAdministrationRoleName(role?: string | null): boolean {
    if (!role || typeof role !== 'string') {
        return false;
    }

    const normalized = normalizeRoleName(role);

    return normalized.includes('administracion') || normalized.includes('administrador') || /\badmin\b/.test(normalized);
}

export function hasManagementPrivileges(user?: { email?: string | null; role?: string | null } | null): boolean {
    if (!user) {
        return false;
    }

    if (user.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
        return true;
    }

    if (isManagementRoleName(user.role)) {
        return true;
    }

    const permissions = (user as { permissions?: Partial<Record<string, { view?: boolean; edit?: boolean }>> }).permissions;

    if (permissions) {
        const managementScreens = ['Team', 'Approvals', 'Import', 'Rates'];
        for (let i = 0; i < managementScreens.length; i++) {
            const screen = managementScreens[i];
            const screenPermissions = permissions[screen];
            if (screenPermissions && screenPermissions.edit === true) {
                return true;
            }
        }
    }

    return false;
}
