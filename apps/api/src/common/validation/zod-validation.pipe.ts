import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z, ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!this.shouldValidate(metadata)) return value;

    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new BadRequestException({
      message: 'Validation failed',
      errors: z.flattenError(result.error),
    });
  }

  private shouldValidate(metadata: ArgumentMetadata): boolean {
    return metadata.type === 'body' || metadata.type === 'query' || metadata.type === 'param';
  }
}
