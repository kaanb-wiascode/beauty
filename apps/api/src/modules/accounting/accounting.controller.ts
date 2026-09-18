import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { AccountingService } from './accounting.service';

const createAccountSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(150),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().uuid().optional(),
});

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  memo: z.string().trim().max(300).optional(),
});

const createJournalEntrySchema = z.object({
  entryDate: z.coerce.date(),
  description: z.string().trim().min(1).max(500),
  referenceType: z.string().trim().max(80).optional(),
  referenceId: z.string().trim().max(150).optional(),
  lines: z.array(journalLineSchema).min(2),
});

const reportFilterSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  { message: 'from must be before or equal to to' },
);

@Controller('accounting')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('accounting', 'read')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('accounts')
  @RequirePermission('accounting', 'manage')
  createAccount(@Body() body: unknown) {
    return this.accountingService.createAccount(createAccountSchema.parse(body));
  }

  @Get('accounts')
  listAccounts() {
    return this.accountingService.listAccounts();
  }

  @Get('reports/trial-balance')
  trialBalance(@Query() query: unknown) {
    return this.accountingService.trialBalance(reportFilterSchema.parse(query));
  }

  @Get('reports/income-summary')
  incomeSummary(@Query() query: unknown) {
    return this.accountingService.incomeSummary(reportFilterSchema.parse(query));
  }

  @Get('reports/accounts/:accountId/ledger')
  accountLedger(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @Query() query: unknown,
  ) {
    return this.accountingService.accountLedger(
      accountId,
      reportFilterSchema.parse(query),
    );
  }

  @Post('journal-entries')
  @RequirePermission('accounting', 'manage')
  createJournalEntry(@Body() body: unknown) {
    return this.accountingService.createJournalEntry(createJournalEntrySchema.parse(body));
  }

  @Get('journal-entries')
  listJournalEntries() {
    return this.accountingService.listJournalEntries();
  }

  @Get('journal-entries/:id')
  getJournalEntry(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountingService.getJournalEntry(id);
  }

  @Post('journal-entries/:id/post')
  @RequirePermission('accounting', 'manage')
  postJournalEntry(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accountingService.postJournalEntry(id);
  }
}
