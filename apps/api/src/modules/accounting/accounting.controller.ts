import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
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

@Controller('accounting')
@UseGuards(JwtAuthGuard, TenantAuthGuard)
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('accounts')
  createAccount(@Body() body: unknown) {
    return this.accountingService.createAccount(createAccountSchema.parse(body));
  }

  @Get('accounts')
  listAccounts() {
    return this.accountingService.listAccounts();
  }

  @Post('journal-entries')
  createJournalEntry(@Body() body: unknown) {
    return this.accountingService.createJournalEntry(createJournalEntrySchema.parse(body));
  }

  @Get('journal-entries')
  listJournalEntries() {
    return this.accountingService.listJournalEntries();
  }

  @Get('journal-entries/:id')
  getJournalEntry(@Param('id') id: string) {
    return this.accountingService.getJournalEntry(id);
  }

  @Post('journal-entries/:id/post')
  postJournalEntry(@Param('id') id: string) {
    return this.accountingService.postJournalEntry(id);
  }
}
