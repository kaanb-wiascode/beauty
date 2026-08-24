import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
  } from '@nestjs/common';
  
  import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
  import { TenantAuthGuard } from '../../common/tenant/tenant-auth.guard';
  
  import {
    createCustomerSchema,
    CreateCustomerInput,
  } from './dto/create-customer.dto';
  
  import {
    updateCustomerSchema,
    UpdateCustomerInput,
  } from './dto/update-customer.dto';
  
  import { CustomersService } from './customers.service';
  
  @Controller('customers')
  @UseGuards(JwtAuthGuard, TenantAuthGuard)
  export class CustomersController {
    constructor(
      private readonly customersService: CustomersService,
    ) {}
  
    @Post()
    async create(@Body() body: unknown) {
      const input: CreateCustomerInput =
        createCustomerSchema.parse(body);
  
      return this.customersService.create(input);
    }
  
    @Get()
    async findAll() {
      return this.customersService.findAll();
    }
  
    @Get(':id')
    async findOne(@Param('id') id: string) {
      return this.customersService.findOne(id);
    }
  
    @Patch(':id')
    async update(
      @Param('id') id: string,
      @Body() body: unknown,
    ) {
      const input: UpdateCustomerInput =
        updateCustomerSchema.parse(body);
  
      return this.customersService.update(id, input);
    }
  
    @Delete(':id')
    async remove(@Param('id') id: string) {
      return this.customersService.remove(id);
    }
  }