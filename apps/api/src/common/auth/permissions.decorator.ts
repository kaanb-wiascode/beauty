import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'required_permission';

export type RequiredPermission = {
  resource: string;
  action: string;
};

export const RequirePermission = (
  resource: string,
  action: string,
) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, {
    resource,
    action,
  } satisfies RequiredPermission);
