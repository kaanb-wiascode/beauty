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
  };
};

export type Customer = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerInput = {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
};

export type UpdateCustomerInput = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  email?: string | null;
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
