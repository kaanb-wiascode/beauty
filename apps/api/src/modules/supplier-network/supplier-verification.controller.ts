import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PlatformAdminGuard } from '../../common/auth/platform-admin.guard';
import { SupplierVerificationService } from './supplier-verification.service';

const idSchema = z.string().uuid();
const documentSchema = z.object({
  documentType: z.enum([
    'TAX_REGISTRATION',
    'TRADE_REGISTRY',
    'AUTHORIZATION',
    'BANK_ACCOUNT_PROOF',
    'CERTIFICATE',
    'OTHER',
  ]),
  storageKey: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !/^https?:\/\//i.test(value), {
      message: 'storageKey must be an opaque object key, not a public URL',
    }),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().nonnegative().safe().optional(),
  checksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
});

const decisionSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'REJECTED' && !value.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A rejection reason is required',
      });
    }
  });

@Controller('platform/supplier-network')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SupplierVerificationController {
  constructor(private readonly verification: SupplierVerificationService) {}

  @Get('organizations/:organizationId/verification-cases')
  async listCases(@Param('organizationId') organizationId: string) {
    return this.verification.listCases(idSchema.parse(organizationId));
  }

  @Post('organizations/:organizationId/verification-cases')
  async openCase(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verification.openCase(idSchema.parse(organizationId), user.sub);
  }

  @Post('organizations/:organizationId/verification-cases/:caseId/documents')
  async registerDocument(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verification.registerDocument(
      idSchema.parse(organizationId),
      idSchema.parse(caseId),
      documentSchema.parse(body),
      user.sub,
    );
  }

  @Post('organizations/:organizationId/verification-cases/:caseId/submit')
  async submitCase(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.verification.submitCase(
      idSchema.parse(organizationId),
      idSchema.parse(caseId),
      user.sub,
    );
  }

  @Post('organizations/:organizationId/verification-cases/:caseId/decision')
  async decideCase(
    @Param('organizationId') organizationId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    const input = decisionSchema.parse(body);
    return this.verification.decideCase(
      idSchema.parse(organizationId),
      idSchema.parse(caseId),
      input.decision,
      input.reason,
      user.sub,
    );
  }
}
