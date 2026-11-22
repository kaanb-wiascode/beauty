import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '@beauty-erp/database';
import { RedisService } from '../../../infrastructure/redis/redis.service';
import { TenantContext } from '../../../common/tenant/tenant-context';

@Injectable()
export class DeviceSecurityGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId = this.tenantContext.getTenantId();

    // Tenant yoksa (örn: genel / public endpointler) cihaz kontrolü uygulanmaz
    if (!tenantId) {
      return true;
    }

    const deviceIdentifier =
      request.headers['x-device-identifier'] || request.headers['x-device-id'];
    const clientIp =
      request.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      request.socket.remoteAddress ||
      '';

    // 1. IP Kısıtlama Kontrolü (IP Whitelisting)
    const allowedIps = await this.prisma.tenantAllowedIp.findMany({
      where: { tenantId, isActive: true },
      select: { ipAddress: true },
    });

    if (allowedIps.length > 0) {
      const isIpMatched = allowedIps.some((entry) => clientIp.includes(entry.ipAddress));
      if (!isIpMatched) {
        throw new ForbiddenException(
          `IP_NOT_ALLOWED: Bu IP adresinden (${clientIp}) erişim yetkiniz bulunmamaktadır. Lütfen klinik ağından bağlanın.`,
        );
      }
    }

    // 2. Cihaz Tanımlama & Onay Kontrolü (Zero-Trust Device Fingerprint)
    if (!deviceIdentifier) {
      throw new ForbiddenException(
        'DEVICE_IDENTIFIER_MISSING: Cihaz kimliği bulunamadı. Lütfen Valoo onaylı cihaz üzerinden giriş yapın.',
      );
    }

    // Önce Redis önbelleğinden kontrol et (Ultra Hızlı)
    const cachedAllowed = await this.redis
      .getClient()
      .get(`valoo:device_allowed:${tenantId}:${deviceIdentifier}`);

    if (cachedAllowed === '1') {
      return true;
    }

    // Veritabanından cihaz durumunu sorgula
    let device = await this.prisma.tenantDevice.findUnique({
      where: {
        tenantId_deviceIdentifier: {
          tenantId,
          deviceIdentifier,
        },
      },
    });

    // Cihaz hiç kayıtlı değilse "Onay Bekliyor" (PENDING) olarak kaydet
    if (!device) {
      const userAgent = request.headers['user-agent'] || 'Bilinmeyen Cihaz';
      device = await this.prisma.tenantDevice.create({
        data: {
          tenantId,
          deviceIdentifier,
          deviceName: `Yeni Cihaz (${clientIp})`,
          lastIpAddress: clientIp,
          browserInfo: userAgent.substring(0, 100),
          status: 'PENDING',
        },
      });
    }

    if (device.status === 'APPROVED') {
      // Redis önbelleğine al
      await this.redis
        .getClient()
        .set(`valoo:device_allowed:${tenantId}:${deviceIdentifier}`, '1', 'EX', 86400 * 7);
      return true;
    }

    if (device.status === 'BLOCKED' || device.status === 'REVOKED') {
      throw new ForbiddenException(
        'DEVICE_BLOCKED: Bu cihazın sisteme erişimi Superadmin tarafından engellenmiştir.',
      );
    }

    // PENDING durumunda
    throw new ForbiddenException(
      `DEVICE_PENDING_APPROVAL: Bu cihaz (${deviceIdentifier}) henüz platform yöneticisi tarafından onaylanmamıştır. Lütfen yöneticiniz ile iletişime geçin.`,
    );
  }
}
