import {
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  
  import { PrismaService } from '@beauty-erp/database';
  
  import { TenantContext } from '../../common/tenant/tenant-context';
  import { CreateCustomerInput } from './dto/create-customer.dto';
  import { UpdateCustomerInput } from './dto/update-customer.dto';
  
  @Injectable()
  export class CustomersService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly tenantContext: TenantContext,
    ) {}
  
    async create(input: CreateCustomerInput) {
      const tenantId = this.tenantContext.getTenantId();
  
      return this.prisma.customer.create({
        data: {
          tenantId,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phone: input.phone?.trim() || null,
          email: input.email?.trim().toLowerCase() || null,
        },
      });
    }
  
    async findAll() {
      const tenantId = this.tenantContext.getTenantId();
  
      return this.prisma.customer.findMany({
        where: {
          tenantId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }
  
    async findOne(id: string) {
      const tenantId = this.tenantContext.getTenantId();
  
      const customer = await this.prisma.customer.findFirst({
        where: {
          id,
          tenantId,
        },
      });
  
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
  
      return customer;
    }
  
    async update(id: string, input: UpdateCustomerInput) {
      const tenantId = this.tenantContext.getTenantId();
  
      const customer = await this.prisma.customer.findFirst({
        where: {
          id,
          tenantId,
        },
        select: {
          id: true,
        },
      });
  
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
  
      return this.prisma.customer.update({
        where: {
          id: customer.id,
        },
        data: {
          ...(input.firstName !== undefined && {
            firstName: input.firstName.trim(),
          }),
          ...(input.lastName !== undefined && {
            lastName: input.lastName.trim(),
          }),
          ...(input.phone !== undefined && {
            phone: input.phone?.trim() || null,
          }),
          ...(input.email !== undefined && {
            email: input.email?.trim().toLowerCase() || null,
          }),
        },
      });
    }
  
    async remove(id: string) {
      const tenantId = this.tenantContext.getTenantId();
  
      const customer = await this.prisma.customer.findFirst({
        where: {
          id,
          tenantId,
        },
        select: {
          id: true,
        },
      });
  
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
  
      await this.prisma.customer.delete({
        where: {
          id: customer.id,
        },
      });
  
      return {
        deleted: true,
        id,
      };
    }
  }