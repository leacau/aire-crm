import { defaultPermissions } from '@/lib/data';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import { getAreaPermissionsServer } from '@/lib/server/system-config';
import type { AreaType, ScreenName, ScreenPermission } from '@/lib/types';

export async function hasServerScreenPermission(
  user: ServerUser,
  screen: ScreenName,
  permissionType: 'view' | 'edit',
): Promise<boolean> {
  if (hasServerManagementPrivileges(user)) return true;

  if (user.permissions?.[screen]?.[permissionType] === true) {
    return true;
  }

  const permissions = await getAreaPermissionsServer();
  const area = user.area as AreaType | undefined;

  if (area && permissions[area]?.[screen]?.[permissionType] === true) {
    return true;
  }

  return Boolean(area && defaultPermissions[area]?.[screen]?.[permissionType] === true);
}
