import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Tüm kiracı (tenant) firmaları listeler
   */
  async listTenants() {
    return this.prisma.tenant.findMany({
      include: {
        modules: {
          include: {
            module: true,
          },
        },
        _count: {
          select: {
            devices: true,
            allowedIps: true,
            staff: true,
            appointments: true,
          },
        },
        securityPolicy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Sistem genelindeki tüm modülleri listeler
   */
  async listModules() {
    return this.prisma.platformModule.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Bir firmanın belirli bir modülünü açar veya kapatır (Entitlement toggle)
   */
  async toggleTenantModule(tenantId: string, moduleCode: string, isEnabled: boolean) {
    const module = await this.prisma.platformModule.findUnique({
      where: { code: moduleCode },
    });

    if (!module) {
      throw new NotFoundException(`Modül bulunamadı: ${moduleCode}`);
    }

    if (module.isCore && !isEnabled) {
      throw new BadRequestException('Çekirdek modül (Core) kapatılamaz.');
    }

    if (isEnabled) {
      return this.prisma.tenantModule.upsert({
        where: {
          tenantId_moduleId: {
            tenantId,
            moduleId: module.id,
          },
        },
        create: {
          tenantId,
          moduleId: module.id,
          status: 'ACTIVE',
        },
        update: {
          status: 'ACTIVE',
        },
      });
    } else {
      return this.prisma.tenantModule.update({
        where: {
          tenantId_moduleId: {
            tenantId,
            moduleId: module.id,
          },
        },
        data: {
          status: 'SUSPENDED',
        },
      });
    }
  }

  /**
   * Zero-Trust Cihaz Listesi (Filtrelenebilir: PENDING, APPROVED, BLOCKED, ALL)
   */
  async listDevices(status?: 'PENDING' | 'APPROVED' | 'BLOCKED' | 'REVOKED') {
    return this.prisma.tenantDevice.findMany({
      where: status ? { status } : undefined,
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
        approvedByAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cihazı onaylar (Yalnızca siz veya yetkili adminler çağırabilir)
   */
  async approveDevice(deviceId: string, adminId?: string) {
    const device = await this.prisma.tenantDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Cihaz bulunamadı.');
    }

    const updated = await this.prisma.tenantDevice.update({
      where: { id: deviceId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedByAdminId: adminId ?? null,
      },
    });

    // Cihazın onay durumunu anında Redis'e önbellekle
    await this.redis.getClient().set(
      `valoo:device_allowed:${device.tenantId}:${device.deviceIdentifier}`,
      '1',
      'EX',
      86400 * 7,
    );

    return updated;
  }

  /**
   * Cihazı kalıcı olarak engeller / reddeder
   */
  async blockDevice(deviceId: string, reason?: string) {
    const device = await this.prisma.tenantDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Cihaz bulunamadı.');
    }

    const updated = await this.prisma.tenantDevice.update({
      where: { id: deviceId },
      data: {
        status: 'BLOCKED',
        rejectionReason: reason ?? 'Yönetici tarafından engellendi.',
      },
    });

    // Redis önbelleğini sil
    await this.redis.getClient().del(`valoo:device_allowed:${device.tenantId}:${device.deviceIdentifier}`);

    return updated;
  }

  /**
   * Cihazın yetkisini iptal eder (Remote Session Wipe)
   */
  async revokeDevice(deviceId: string) {
    const device = await this.prisma.tenantDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Cihaz bulunamadı.');
    }

    const updated = await this.prisma.tenantDevice.update({
      where: { id: deviceId },
      data: {
        status: 'REVOKED',
      },
    });

    // Cihazın tüm aktif oturumlarını Redis'ten saniyede temizle
    await this.redis.getClient().del(`valoo:device_allowed:${device.tenantId}:${device.deviceIdentifier}`);

    return updated;
  }

  /**
   * Şube bazlı izinli IP'leri listeler
   */
  async listAllowedIps(tenantId?: string) {
    return this.prisma.tenantAllowedIp.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Şubeye sabit IP ekler
   */
  async addAllowedIp(tenantId: string, ipAddress: string, label: string, branchId?: string) {
    return this.prisma.tenantAllowedIp.create({
      data: {
        tenantId,
        branchId: branchId ?? null,
        ipAddress: ipAddress.trim(),
        label: label.trim(),
        isActive: true,
      },
    });
  }

  /**
   * İzinli IP kaydını siler
   */
  async deleteAllowedIp(ipId: string) {
    return this.prisma.tenantAllowedIp.delete({
      where: { id: ipId },
    });
  }

  /**
   * Altyapı ve Sistem Sağlığı Metrikleri
   */
  async getSystemHealthMetrics() {
    const [tenantsCount, devicesCount, pendingDevicesCount] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenantDevice.count({ where: { status: 'APPROVED' } }),
      this.prisma.tenantDevice.count({ where: { status: 'PENDING' } }),
    ]);

    const redisPing = await this.redis.getClient().ping();

    return {
      status: 'HEALTHY',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      metrics: {
        totalTenants: tenantsCount,
        approvedDevices: devicesCount,
        pendingApprovalDevices: pendingDevicesCount,
        redisStatus: redisPing === 'PONG' ? 'UP' : 'DOWN',
        nodeVersion: process.version,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    };
  }
}
