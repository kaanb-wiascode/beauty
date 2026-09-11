import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QualityPublicFeedbackService } from './quality-public-feedback.service';

@Controller('public/quality/feedback')
export class QualityPublicFeedbackController {
  constructor(private readonly publicFeedback: QualityPublicFeedbackService) {}

  @Get(':token')
  open(@Param('token') token: string) {
    return this.publicFeedback.open(token);
  }

  @Post(':token')
  submit(
    @Param('token') token: string,
    @Body() body: { rating?: number; comment?: string | null },
  ) {
    return this.publicFeedback.submit(token, {
      rating: Number(body?.rating),
      comment: body?.comment ?? null,
    });
  }
}
