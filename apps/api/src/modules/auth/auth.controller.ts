import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginSchema, LoginInput } from './dto/login.dto';
import { registerSchema, RegisterInput } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const input: RegisterInput = registerSchema.parse(body);

    return this.authService.register(input);
  }

  @Post('login')
  async login(@Body() body: unknown) {
    const input: LoginInput = loginSchema.parse(body);

    return this.authService.login(input);
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }
}