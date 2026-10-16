import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PLATFORM_PERMISSION_KEY =
  'required_platform_permission';

export type RequiredPlatformPermission = {
  resource: string;
  action: string;
};

export const RequirePlatformPermission = (
  resource: string,
  action: string,
) =>
  SetMetadata(REQUIRED_PLATFORM_PERMISSION_KEY, {
    resource,
    action,
  } satisfies RequiredPlatformPermission);
