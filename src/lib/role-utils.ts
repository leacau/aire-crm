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
    
    if (!user.role) return false;

    // Check for specific high-level roles first
    if (user.role === 'Jefe' || user.role === 'Gerencia' || user.role === 'Admin' || user.role === 'Administracion') {
        return true;
    }

    // Then check for other management-like roles by pattern
    if (isManagementRoleName(user.role)) {
        return true;
    }

    return false;
}
