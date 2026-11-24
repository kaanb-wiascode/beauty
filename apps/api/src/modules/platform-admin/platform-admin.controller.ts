import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';

@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Get('tenants')
  async listTenants() {
    return this.platformAdminService.listTenants();
  }

  @Get('modules')
  async listModules() {
    return this.platformAdminService.listModules();
  }

  @Post('tenants/:tenantId/modules/:moduleCode/toggle')
  async toggleTenantModule(
    @Param('tenantId') tenantId: string,
    @Param('moduleCode') moduleCode: string,
    @Body('isEnabled') isEnabled: boolean,
  ) {
    return this.platformAdminService.toggleTenantModule(
      tenantId,
      moduleCode,
      isEnabled,
    );
  }

  @Get('devices')
  async listDevices(@Query('status') status?: 'PENDING' | 'APPROVED' | 'BLOCKED' | 'REVOKED') {
    return this.platformAdminService.listDevices(status);
  }

  @Post('devices/:deviceId/approve')
  async approveDevice(
    @Param('deviceId') deviceId: string,
    @Body('adminId') adminId?: string,
  ) {
    return this.platformAdminService.approveDevice(deviceId, adminId);
  }

  @Post('devices/:deviceId/block')
  async blockDevice(
    @Param('deviceId') deviceId: string,
    @Body('reason') reason?: string,
  ) {
    return this.platformAdminService.blockDevice(deviceId, reason);
  }

  @Post('devices/:deviceId/revoke')
  async revokeDevice(@Param('deviceId') deviceId: string) {
    return this.platformAdminService.revokeDevice(deviceId);
  }

  @Get('ips')
  async listAllowedIps(@Query('tenantId') tenantId?: string) {
    return this.platformAdminService.listAllowedIps(tenantId);
  }

  @Post('ips')
  async addAllowedIp(
    @Body('tenantId') tenantId: string,
    @Body('ipAddress') ipAddress: string,
    @Body('label') label: string,
    @Body('branchId') branchId?: string,
  ) {
    return this.platformAdminService.addAllowedIp(tenantId, ipAddress, label, branchId);
  }

  @Delete('ips/:ipId')
  async deleteAllowedIp(@Param('ipId') ipId: string) {
    return this.platformAdminService.deleteAllowedIp(ipId);
  }

  @Get('health')
  async getHealth() {
    return this.platformAdminService.getSystemHealthMetrics();
  }
}
