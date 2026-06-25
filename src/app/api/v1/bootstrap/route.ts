import { NextResponse } from 'next/server';

import { getEnabledModulesForPlatform } from '@/core/modules';
import type { CrmPlatform } from '@/core/modules';
import { getOrganizationModuleConfig } from '@/core/organizations/server';
import { apiErrorResponse, ApiError } from '@/lib/server/api-error';
import {
  getGrantedServerCapabilities,
  isServerResponse,
  requireServerUser,
} from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resolvePlatform(request: Request): CrmPlatform {
  const platform = new URL(request.url).searchParams.get('platform') || 'web';
  if (platform !== 'web' && platform !== 'android') {
    throw new ApiError(400, 'La plataforma solicitada no es válida.', 'INVALID_PLATFORM');
  }
  return platform;
}

export async function GET(request: Request) {
  const user = await requireServerUser(request);
  if (isServerResponse(user)) return user;

  try {
    const platform = resolvePlatform(request);
    const config = await getOrganizationModuleConfig(user.organizationId);
    const enabledModules = getEnabledModulesForPlatform(config, platform);

    const grantedCapabilities = new Set(await getGrantedServerCapabilities(
      user,
      enabledModules.flatMap(definition => definition.capabilities),
    ));

    const modules = enabledModules.map(definition => ({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        version: definition.version,
        apiVersion: definition.apiVersion,
        dependencies: definition.dependencies,
        capabilities: definition.capabilities.filter(capability => grantedCapabilities.has(capability)),
      }));

    return NextResponse.json({
      data: {
        platform,
        organization: { id: user.organizationId },
        user: {
          id: user.uid,
          name: user.name,
          email: user.email,
          role: user.role,
          area: user.area,
        },
        modules,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
