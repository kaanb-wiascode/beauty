import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { JwtPayload } from '../../common/auth/jwt.strategy';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermission } from '../../common/auth/permissions.decorator';
import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
import { CorporateCommunicationsService } from './corporate-communications.service';
import { MarketingExpenseSyncService } from './marketing-expense-sync.service';
import { MarketingLeadWebhookService } from './marketing-lead-webhook.service';
import { MarketingProviderAccountsService } from './marketing-provider-accounts.service';
import { MarketingProviderOAuthService } from './marketing-provider-oauth.service';
import { MarketingProviderSyncService } from './marketing-provider-sync.service';
import {
  createBrandAssetSchema,
  createCampaignSchema,
  createMarketingLeadSchema,
  createProviderConnectionSchema,
  completeProviderOAuthSchema,
  selectProviderAccountSchema,
  createRoutingRuleSchema,
  listCampaignsSchema,
  listMarketingLeadsSchema,
} from './corporate-communications.schemas';

@Controller('corporate-communications')
@UseGuards(JwtAuthGuard, TenantAuthGuard, PermissionsGuard)
@RequirePermission('communications', 'read')
export class CorporateCommunicationsController {
  constructor(
    private readonly service: CorporateCommunicationsService,
    private readonly expenseSync: MarketingExpenseSyncService,
    private readonly providerOAuth: MarketingProviderOAuthService,
    private readonly providerAccounts: MarketingProviderAccountsService,
    private readonly providerSync: MarketingProviderSyncService,
    private readonly leadWebhook: MarketingLeadWebhookService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.service.dashboard();
  }

  @Get('campaigns')
  campaigns(@Query() query: unknown) {
    return this.service.listCampaigns(listCampaignsSchema.parse(query));
  }

  @Get('campaigns/:id')
  campaign(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getCampaign(id);
  }

  @Post('campaigns')
  @RequirePermission('communications', 'manage')
  async createCampaign(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    const campaign = await this.service.createCampaign(createCampaignSchema.parse(body), user.sub);
    await this.expenseSync.syncCampaign(campaign.id);
    return campaign;
  }

  @Get('leads')
  leads(@Query() query: unknown) {
    return this.service.listMarketingLeads(listMarketingLeadsSchema.parse(query));
  }

  @Post('leads')
  @RequirePermission('communications', 'manage')
  createLead(@Body() body: unknown) {
    return this.service.createMarketingLead(createMarketingLeadSchema.parse(body));
  }

  @Get('brand-assets')
  brandAssets() {
    return this.service.listBrandAssets();
  }

  @Post('brand-assets')
  @RequirePermission('communications', 'manage')
  createBrandAsset(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.createBrandAsset(createBrandAssetSchema.parse(body), user.sub);
  }

  @Get('provider-connections')
  providerConnections() {
    return this.service.listProviderConnections();
  }

  @Get('provider-connections/health')
  providerConnectionHealth() {
    return this.service.providerConnectionHealth();
  }

  @Post('provider-connections')
  @RequirePermission('communications', 'manage')
  createProviderConnection(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.createProviderConnection(
      createProviderConnectionSchema.parse(body),
      user.sub,
    );
  }

  @Post('provider-connections/:id/oauth/authorize')
  @RequirePermission('communications', 'manage')
  authorizeProviderConnection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.providerOAuth.authorization(id, user.sub);
  }

  @Post('provider-connections/:id/oauth/complete')
  @RequirePermission('communications', 'manage')
  completeProviderConnectionOAuth(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.providerOAuth.complete(
      id,
      completeProviderOAuthSchema.parse(body),
      user.sub,
    );
  }

  @Get('provider-connections/:id/accounts')
  @RequirePermission('communications', 'manage')
  listProviderAccounts(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.providerAccounts.list(id);
  }

  @Post('provider-connections/:id/accounts/select')
  @RequirePermission('communications', 'manage')
  selectProviderAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const input = selectProviderAccountSchema.parse(body);
    return this.providerAccounts.select(id, input.externalAccountId);
  }

  @Post('provider-connections/:id/webhook/google-ads/configure')
  @RequirePermission('communications', 'manage')
  configureGoogleAdsWebhook(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.leadWebhook.configureGoogleWebhook(id);
  }

  @Post('provider-connections/:id/sync')
  @RequirePermission('communications', 'manage')
  syncProviderConnection(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.providerSync.sync(id, user.sub);
  }

  @Post('provider-connections/:id/oauth/refresh')
  @RequirePermission('communications', 'manage')
  refreshProviderConnectionOAuth(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.providerOAuth.refresh(id);
  }

  @Post('provider-connections/:id/oauth/verify')
  @RequirePermission('communications', 'manage')
  verifyProviderConnectionOAuth(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.providerOAuth.verify(id);
  }

  @Post('provider-connections/:id/disconnect')
  @RequirePermission('communications', 'manage')
  disconnectProviderConnection(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.disconnectProviderConnection(id);
  }

  @Get('routing-rules')
  routingRules() {
    return this.service.listRoutingRules();
  }

  @Post('routing-rules')
  @RequirePermission('communications', 'manage')
  createRoutingRule(@Body() body: unknown, @CurrentUser() user: JwtPayload) {
    return this.service.createRoutingRule(createRoutingRuleSchema.parse(body), user.sub);
  }
}
