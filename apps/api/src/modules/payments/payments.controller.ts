import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';

import { PaymentsService } from './payments.service';
import { createPaymentSchema } from './dto/create-payment.dto';
import { listPaymentsSchema } from './dto/list-payments.dto';
import { refundPaymentSchema } from './dto/refund-payment.dto';
import { paymentSummarySchema } from './dto/payment-summary.dto';

@UseGuards(JwtAuthGuard, TenantAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  async create(@Body() body: unknown) {
    const input = createPaymentSchema.parse(body);

    return this.paymentsService.create(input);
  }

  @Get()
  async findAll(@Query() query: unknown) {
    const input = listPaymentsSchema.parse(query);

    return this.paymentsService.findAll(input);
  }

  @Get('summary')
  async summary(@Query() query: unknown) {
    const input = paymentSummarySchema.parse(query);

    return this.paymentsService.summary(input);
  }

  @Post(':id/refund')
  async refund(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = refundPaymentSchema.parse(body);

    return this.paymentsService.refund(id, input);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }
}
