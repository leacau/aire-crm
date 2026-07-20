import { dbAdmin } from '@/lib/firebase-admin';
import { defaultPermissions } from '@/lib/data';
import { hasServerManagementPrivileges, type ServerUser } from '@/lib/server/auth';
import type { AreaType, ScreenName, ScreenPermission } from '@/lib/types';

const AREA_PERMISSIONS_DOC_ID = 'area_permissions';

type AreaPermissions = Record<AreaType, Partial<Record<ScreenName, ScreenPermission>>>;

async function getAreaPermissions(): Promise<AreaPermissions> {
  const snap = await dbAdmin.collection('system_config').doc(AREA_PERMISSIONS_DOC_ID).get();
  return (snap.exists ? snap.data()?.permissions : null) || defaultPermissions;
}

export async function hasServerScreenPermission(
  user: ServerUser,
  screen: ScreenName,
  permissionType: 'view' | 'edit',
): Promise<boolean> {
  if (hasServerManagementPrivileges(user)) return true;

  if (user.permissions?.[screen]?.[permissionType] === true) {
    return true;
  }

  const permissions = await getAreaPermissions();
  const area = user.area as AreaType | undefined;

  if (area && permissions[area]?.[screen]?.[permissionType] === true) {
    return true;
  }

  return Boolean(area && defaultPermissions[area]?.[screen]?.[permissionType] === true);
}
