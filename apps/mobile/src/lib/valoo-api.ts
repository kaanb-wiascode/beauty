/**
 * Mobile API transport for the existing VALOO backend.
 * Access tokens live only in memory; credentials and tokens are never logged.
 */
export type ValooUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type ValooTenant = { id: string; name: string; slug: string };

export type ValooMembership = {
  id: string;
  role: string;
  roleScope?: string;
  status: string;
  permissions: string[];
};

export type LoginSession = {
  accessToken: string;
  sessionId: string;
  user: ValooUser;
  tenant: ValooTenant;
  membership: ValooMembership;
};

export type MfaChallenge = {
  mfaRequired: true;
  enrollmentRequired: boolean;
  challengeId: string;
  expiresInSeconds: number;
};

export type MfaEnrollment = { secret: string; otpauthUri: string };

export type AuthMe = {
  authenticated: boolean;
  user: {
    sub: string;
    tenantId: string;
    companyId: string;
    membershipId: string;
    branchId: string | null;
    roleScope: string;
  };
  tenantContext: {
    tenantId: string;
    companyId: string;
    membershipId: string;
    branchId: string | null;
  };
};

export type AppointmentStatus = 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type AppointmentRangeDays = 1 | 7 | 30;

export type AppointmentSummary = {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  branchId: string | null;
  customerId: string;
  serviceId: string;
  staffId: string;
  // The API selects only name fields, not customer contact or medical data.
  customer?: { firstName: string; lastName: string };
  service?: { name: string };
  staff?: { firstName: string; lastName: string };
  branch?: { name: string };
};

export type AppointmentsPage = {
  data: AppointmentSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type AppointmentStaffOption = {
  id: string;
  firstName: string;
  lastName: string;
  branchId: string;
};

export type AppointmentStaffOptionsResponse = {
  data: AppointmentStaffOption[];
};

export class ValooApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ValooApiError';
  }
}

function baseUrl(): string {
  const supplied = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!supplied) {
    throw new ValooApiError('Mobil API adresi tanımlı değil (EXPO_PUBLIC_API_URL).', 0);
  }
  let url: URL;
  try {
    url = new URL(supplied);
  } catch {
    throw new ValooApiError('Mobil API adresi geçerli bir URL değil.', 0);
  }
  const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(__DEV__ && localHost && url.protocol === 'http:')) {
    throw new ValooApiError('Güvenli HTTPS API adresi gereklidir.', 0);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ValooApiError('API adresinde kullanıcı bilgisi veya sorgu bulunamaz.', 0);
  }
  return url.href.replace(/\/$/, '');
}

function errorMessage(status: number): string {
  if (status === 401) return 'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.';
  if (status === 403) return 'Bu bilgileri görüntülemeye yetkiniz bulunmuyor.';
  if (status === 429) return 'Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.';
  if (status >= 500) return 'Sunucu şu anda yanıt veremiyor. Daha sonra tekrar deneyin.';
  return 'İşlem tamamlanamadı. Bilgilerinizi kontrol edin.';
}

export async function valooRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; accessToken?: string; signal?: AbortSignal } = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ValooApiError('Geçersiz API yolu.', 0);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      cache: 'no-store',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof ValooApiError) throw error;
    if (options.signal?.aborted) throw error;
    throw new ValooApiError('Sunucuya bağlanılamadı. Ağ bağlantısını kontrol edin.', 0);
  }
  if (!response.ok) throw new ValooApiError(errorMessage(response.status), response.status);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ValooApiError('Sunucudan beklenmeyen bir yanıt alındı.', response.status);
  }
}

export function isMfaChallenge(value: LoginSession | MfaChallenge): value is MfaChallenge {
  return 'mfaRequired' in value && value.mfaRequired === true;
}

export function canReadAppointments(membership: ValooMembership): boolean {
  return membership.permissions.includes('appointments.read');
}

export function appointmentsWindow(
  now = new Date(),
  days: AppointmentRangeDays = 7,
): { from: string; to: string } {
  // Local midnight, not UTC midnight: the window follows the staff member's
  // calendar day across daylight-saving transitions.
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function appointmentsPath(
  page = 1,
  options: {
    days?: AppointmentRangeDays;
    status?: AppointmentStatus | null;
    staffId?: string | null;
  } = {},
): string {
  const { from, to } = appointmentsWindow(new Date(), options.days ?? 7);
  const status = options.status
    ? `&status=${encodeURIComponent(options.status)}`
    : '';
  const staffId = options.staffId
    ? `&staffId=${encodeURIComponent(options.staffId)}`
    : '';
  return `/appointments/mobile-list?page=${page}&limit=20&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${status}${staffId}`;
}
