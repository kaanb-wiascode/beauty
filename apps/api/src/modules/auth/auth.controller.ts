import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { registerSchema, RegisterInput } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const input: RegisterInput = registerSchema.parse(body);

    return this.authService.register(input);
  }
}
