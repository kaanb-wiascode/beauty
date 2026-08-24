import {
    createParamDecorator,
    ExecutionContext,
  } from '@nestjs/common';
  
  import { JwtPayload } from './jwt.strategy';
  
  export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): JwtPayload => {
      const request = context
        .switchToHttp()
        .getRequest<{ user: JwtPayload }>();
  
      return request.user;
    },
  );