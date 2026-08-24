import {
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  import { AuthGuard } from '@nestjs/passport';
  
  @Injectable()
  export class JwtAuthGuard extends AuthGuard('jwt') {
    canActivate(context: ExecutionContext) {
      return super.canActivate(context);
    }
  
    handleRequest<TUser = unknown>(
      err: unknown,
      user: TUser,
    ): TUser {
      if (err || !user) {
        throw err || new UnauthorizedException('Authentication required');
      }
  
      return user;
    }
  }