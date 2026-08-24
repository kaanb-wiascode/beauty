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
      if (err) {
        throw err;
      }
  
      if (!user) {
        throw new UnauthorizedException('JWT user not found');
      }
  
      return user;
    }
  }