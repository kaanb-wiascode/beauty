import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class HrService {
  constructor(private readonly db: DatabaseService) {}

  async attendance() {
    // Keep this endpoint schema-safe until the HR migration is deployed.
    // Returning an empty collection is preferable to breaking the existing Staff/ERP workspace.
    return [];
  }

  async leaves() {
    return [];
  }

  async payroll() {
    return [];
  }
}
