import { Injectable } from '@nestjs/common';

import { reportDefinitions } from './report-definition';

@Injectable()
export class ReportsService {
  getCatalog() {
    return reportDefinitions;
  }
}
