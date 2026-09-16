import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import {
  AuthPublicRateLimit,
  AuthPublicRateLimitGuard,
} from '../auth/auth-public-rate-limit.guard';
import { QualityPublicFeedbackService } from './quality-public-feedback.service';

const tokenSchema = z.string().trim().min(32).max(1024);
const submitSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(4000).nullable().optional(),
});

@Controller('public/quality/feedback')
@UseGuards(AuthPublicRateLimitGuard)
export class QualityPublicFeedbackController {
  constructor(
    private readonly publicFeedback: QualityPublicFeedbackService,
  ) {}

  @Get(':token')
  @AuthPublicRateLimit('quality-feedback-open', 60, 60)
  open(@Param('token') token: string) {
    return this.publicFeedback.open(tokenSchema.parse(token));
  }

  @Post(':token')
  @AuthPublicRateLimit('quality-feedback-submit', 12, 60)
  submit(@Param('token') token: string, @Body() body: unknown) {
    return this.publicFeedback.submit(
      tokenSchema.parse(token),
      submitSchema.parse(body),
    );
  }
}
