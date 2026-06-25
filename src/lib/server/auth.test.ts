import { describe, expect, it } from 'vitest';

import type { ServerUser } from './auth';
import { hasScreenPermission, hasServerManagementPrivileges } from './auth';

const advisor: ServerUser = {
  uid: 'advisor-1',
  organizationId: 'aire-de-santa-fe',
  name: 'Asesora Uno',
  email: 'asesora@airedesantafe.com.ar',
  role: 'Asesor',
  area: 'Comercial',
};

describe('server authorization', () => {
  it('grants management privileges to current management roles', () => {
    expect(hasServerManagementPrivileges({ ...advisor, role: 'Gerencia' })).toBe(true);
    expect(hasServerManagementPrivileges(advisor)).toBe(false);
  });

  it('uses area permissions for regular users', () => {
    expect(hasScreenPermission(advisor, 'Prospects', 'view')).toBe(true);
    expect(hasScreenPermission(advisor, 'Prospects', 'edit')).toBe(true);
  });

  it('gives user-specific permissions precedence over area defaults', () => {
    const restrictedUser: ServerUser = {
      ...advisor,
      permissions: { Prospects: { view: true, edit: false } },
    };

    expect(hasScreenPermission(restrictedUser, 'Prospects', 'view')).toBe(true);
    expect(hasScreenPermission(restrictedUser, 'Prospects', 'edit')).toBe(false);
  });

  it('keeps compatibility with advisor profiles that do not have an area yet', () => {
    const userWithoutArea = { ...advisor, area: undefined };
    expect(hasScreenPermission(userWithoutArea, 'Prospects', 'view')).toBe(true);
  });

  it('denies access when neither role, area nor explicit permissions grant it', () => {
    const userWithoutAccess = { ...advisor, role: undefined, area: undefined };
    expect(hasScreenPermission(userWithoutAccess, 'Prospects', 'view')).toBe(false);
  });
});
