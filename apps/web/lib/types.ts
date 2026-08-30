export type Paginated<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type AuthTenant = {
  id: string;
  name: string;
  slug: string;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  tenant: AuthTenant;
  membership: {
    id: string;
    role: string;
    status: string;
    permissions: string[];
  };
};

export type CustomerSource =
  | "INSTAGRAM"
  | "GOOGLE"
  | "REFERRAL"
  | "WALK_IN"
  | "OTHER";

export type Customer = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  customerSource: CustomerSource | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerHealthProfile = {
  allergies: string | null;
  sensitivities: string | null;
  medications: string | null;
  conditions: string | null;
  notes: string | null;
};

export type CustomerConsentType =
  | "KVKK_ACKNOWLEDGEMENT"
  | "EXPLICIT_CONSENT"
  | "MEMBERSHIP_AGREEMENT"
  | "HEALTH_FORM_COMPLETION"
  | "HEALTH_DATA_CONSENT"
  | "MARKETING_SMS"
  | "MARKETING_EMAIL"
  | "MARKETING_PHONE";

export type CustomerConsent = {
  id: string;
  type: CustomerConsentType;
  status: "ACCEPTED" | "DECLINED";
  documentVersion: string;
  acceptedAt: string | null;
  source: "WEB" | "STAFF" | "KIOSK" | "DIGITAL_SIGNATURE";
};

export type StaffStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type Staff = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  status: StaffStatus;
  createdAt: string;
  updatedAt: string;
};

export type ServiceStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type Service = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string | number;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type Appointment = {
  id: string;
  tenantId: string;
  customerId: string;
  staffId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  payment: {
    id: string;
    amount: string | number;
    method: "CASH" | "CARD" | "TRANSFER";
    paidAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerInput = {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  customerSource?: CustomerSource;
  healthProfile?: {
    allergies?: string;
    sensitivities?: string;
    medications?: string;
    conditions?: string;
    notes?: string;
  };
  consents?: {
    kvkkAcknowledgement?: boolean;
    explicitConsent?: boolean;
    membershipAgreement?: boolean;
    healthFormCompletion?: boolean;
    healthDataConsent?: boolean;
    marketingSms?: boolean;
    marketingEmail?: boolean;
    marketingPhone?: boolean;
  };
};

export type UpdateCustomerInput = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  customerSource?: CustomerSource | null;
};

export type CreateStaffInput = {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
};

export type UpdateStaffInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
};

export type CreateServiceInput = {
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
};

export type UpdateServiceInput = {
  name?: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
};

export type CreateAppointmentInput = {
  customerId: string;
  staffId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  notes?: string;
};

export type UpdateAppointmentInput = {
  customerId?: string;
  staffId?: string;
  serviceId?: string;
  startAt?: string;
  endAt?: string;
  notes?: string;
  status?: AppointmentStatus;
};
