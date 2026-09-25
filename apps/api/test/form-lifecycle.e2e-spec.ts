import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';

import { AppModule } from './../src/app.module';
import { PrismaExceptionFilter } from './../src/common/database/prisma-exception.filter';
import { ZodExceptionFilter } from './../src/common/validation/zod-exception.filter';

jest.setTimeout(120_000);

describe('User-facing form lifecycle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new ZodExceptionFilter(),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists and reads back customer, service, employee, lead, appointment and payment form data', async () => {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const password = 'FormE2eStrongPassword!2026';
    const email = `forms-${suffix}@example.test`;

    const register = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        firstName: 'Form',
        lastName: 'Owner',
        tenantName: `Form E2E ${suffix}`,
        tenantSlug: `form-e2e-${suffix}`,
      })
      .expect(201);

    const membershipId = register.body.membership.id as string;
    const branchId = register.body.branch.id as string;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    const centralToken = login.body.accessToken as string;

    const branchContext = await request(app.getHttpServer())
      .post('/auth/context/switch')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ membershipId, branchId })
      .expect(201);

    const token = branchContext.body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };

    // Yeni Müşteri formu: zorunlu alan doğrulaması.
    await request(app.getHttpServer())
      .post('/customers')
      .set(auth)
      .send({ firstName: 'Eksik' })
      .expect(400);

    const customerPayload = {
      firstName: 'Elif',
      lastName: `Form-${suffix}`,
      phone: `+90555${suffix.slice(0, 7)}`,
      email: `customer-${suffix}@example.test`,
      birthDate: '1992-09-21',
      customerSource: 'INSTAGRAM',
      consents: {
        kvkkAcknowledgement: true,
        explicitConsent: true,
        membershipAgreement: true,
        healthFormCompletion: true,
        healthDataConsent: true,
        marketingSms: true,
        marketingEmail: false,
        marketingPhone: true,
      },
      healthProfile: {
        allergies: 'Lateks',
        sensitivities: 'Hassas cilt',
        medications: 'Yok',
        conditions: 'Yok',
        notes: 'Form lifecycle E2E sağlık notu',
      },
    };

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set(auth)
      .send(customerPayload)
      .expect(201);

    const customerRead = await request(app.getHttpServer())
      .get(`/customers/${customer.body.id}`)
      .set(auth)
      .expect(200);

    expect(customerRead.body.firstName).toBe(customerPayload.firstName);
    expect(customerRead.body.lastName).toBe(customerPayload.lastName);
    expect(customerRead.body.email).toBe(customerPayload.email);
    expect(customerRead.body.customerSource).toBe(customerPayload.customerSource);

    // Yeni Hizmet formu: genişletilmiş fiyat/süre payload'ı.
    await request(app.getHttpServer())
      .post('/services')
      .set(auth)
      .send({ name: 'Geçersiz Hizmet', durationMinutes: 0, price: -1 })
      .expect(400);

    const servicePayload = {
      name: `Premium Cilt Bakımı ${suffix}`,
      category: 'Cilt Bakımı',
      description: 'Form lifecycle E2E hizmeti',
      durationMinutes: 75,
      preparationMinutes: 10,
      cleanupMinutes: 15,
      price: 1250,
      cost: 310,
      taxRate: 20,
      currency: 'TRY',
      requiresConsultation: true,
    };

    const service = await request(app.getHttpServer())
      .post('/services')
      .set(auth)
      .send(servicePayload)
      .expect(201);

    const serviceRead = await request(app.getHttpServer())
      .get(`/services/${service.body.id}`)
      .set(auth)
      .expect(200);

    expect(serviceRead.body.name).toBe(servicePayload.name);
    expect(Number(serviceRead.body.price)).toBe(servicePayload.price);
    expect(serviceRead.body.durationMinutes).toBe(servicePayload.durationMinutes);
    expect(serviceRead.body.preparationMinutes).toBe(servicePayload.preparationMinutes);
    expect(serviceRead.body.cleanupMinutes).toBe(servicePayload.cleanupMinutes);
    expect(serviceRead.body.requiresConsultation).toBe(true);

    // Yeni Personel formu: HR employee master + staff kaydı.
    await request(app.getHttpServer())
      .post('/hr/employees')
      .set(auth)
      .send({ firstName: 'Eksik Personel' })
      .expect(400);

    const employeePayload = {
      firstName: 'Deniz',
      lastName: `Personel-${suffix}`,
      phone: `+90554${suffix.slice(0, 7)}`,
      email: `employee-${suffix}@example.test`,
      personnelNumber: `PRS-${suffix.toUpperCase()}`,
      position: 'Uzman',
      department: 'Operasyon',
      employmentType: 'FULL_TIME',
      hireDate: '2026-09-01',
    };

    const employee = await request(app.getHttpServer())
      .post('/hr/employees')
      .set(auth)
      .send(employeePayload)
      .expect(201);

    const employees = await request(app.getHttpServer())
      .get('/hr/employees')
      .set(auth)
      .expect(200);

    const employeeRead = (employees.body as Array<Record<string, unknown>>).find(
      (row) => row.id === employee.body.id,
    );

    expect(employeeRead).toBeDefined();
    expect(employeeRead?.firstName).toBe(employeePayload.firstName);
    expect(employeeRead?.personnelNumber).toBe(employeePayload.personnelNumber);
    expect(employeeRead?.position).toBe(employeePayload.position);
    expect(employeeRead?.department).toBe(employeePayload.department);

    // Yeni Potansiyel Müşteri formu: güncel genişletilmiş CRM payload'ı.
    await request(app.getHttpServer())
      .post('/crm/leads')
      .set(auth)
      .send({ firstName: 'Eksik', lastName: 'Lead' })
      .expect(400);

    const leadPayload = {
      firstName: 'Mert',
      lastName: `Lead-${suffix}`,
      phone: `+90553${suffix.slice(0, 7)}`,
      alternativePhone: `+90552${suffix.slice(0, 7)}`,
      email: `lead-${suffix}@example.test`,
      preferredContactChannel: 'WHATSAPP',
      language: 'tr',
      source: 'INSTAGRAM',
      sourceDetail: 'Form Lifecycle E2E Kampanyası',
      interestedServiceIds: [service.body.id],
      preferredBranchId: branchId,
      estimatedBudget: 2500,
      budgetCurrency: 'TRY',
      purchaseUrgency: 'THIS_WEEK',
      consultationNeed: 'REQUESTED',
      customerIntent: 'Cilt bakımı paketini değerlendirmek istiyor',
      team: 'Merkez Satış',
      leadScore: 82,
      leadTemperature: 'HOT',
      interestNote: 'Form lifecycle E2E lead notu',
    };

    const lead = await request(app.getHttpServer())
      .post('/crm/leads')
      .set(auth)
      .send(leadPayload)
      .expect(201);

    const leadRead = await request(app.getHttpServer())
      .get(`/crm/leads/${lead.body.id}`)
      .set(auth)
      .expect(200);

    expect(leadRead.body.firstName).toBe(leadPayload.firstName);
    expect(leadRead.body.preferredContactChannel).toBe('WHATSAPP');
    expect(Number(leadRead.body.estimatedBudget)).toBe(2500);
    expect(leadRead.body.leadTemperature).toBe('HOT');
    expect(leadRead.body.interestedServiceIds).toContain(service.body.id);

    // Yeni Randevu formu: gerçek müşteri/personel/hizmet referanslarıyla kayıt.
    const startAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    startAt.setUTCMinutes(0, 0, 0);
    const endAt = new Date(startAt.getTime() + servicePayload.durationMinutes * 60 * 1000);

    await request(app.getHttpServer())
      .post('/appointments')
      .set(auth)
      .send({
        customerId: customer.body.id,
        staffId: employee.body.id,
        serviceId: service.body.id,
        startAt: endAt.toISOString(),
        endAt: startAt.toISOString(),
      })
      .expect(400);

    const appointmentPayload = {
      customerId: customer.body.id,
      staffId: employee.body.id,
      serviceId: service.body.id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      notes: 'Form lifecycle E2E randevu notu',
    };

    const appointment = await request(app.getHttpServer())
      .post('/appointments')
      .set(auth)
      .send(appointmentPayload)
      .expect(201);

    const appointmentRead = await request(app.getHttpServer())
      .get(`/appointments/${appointment.body.id}`)
      .set(auth)
      .expect(200);

    expect(appointmentRead.body.customerId).toBe(customer.body.id);
    expect(appointmentRead.body.staffId).toBe(employee.body.id);
    expect(appointmentRead.body.serviceId).toBe(service.body.id);
    expect(appointmentRead.body.notes).toBe(appointmentPayload.notes);

    // Ödeme Al formu: kayıt + tekrar okuma + duplicate koruması.
    const paymentPayload = {
      appointmentId: appointment.body.id,
      amount: servicePayload.price,
      method: 'CARD',
      paidAt: new Date().toISOString(),
    };

    const payment = await request(app.getHttpServer())
      .post('/payments')
      .set(auth)
      .send(paymentPayload)
      .expect(201);

    const paymentRead = await request(app.getHttpServer())
      .get(`/payments/${payment.body.id}`)
      .set(auth)
      .expect(200);

    expect(paymentRead.body.appointmentId).toBe(appointment.body.id);
    expect(Number(paymentRead.body.amount)).toBe(servicePayload.price);
    expect(paymentRead.body.method).toBe('CARD');
    expect(paymentRead.body.status).toBe('COMPLETED');

    await request(app.getHttpServer())
      .post('/payments')
      .set(auth)
      .send(paymentPayload)
      .expect(409);
  });
});
