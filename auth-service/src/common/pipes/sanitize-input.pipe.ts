import { Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class SanitizeInputPipe implements PipeTransform {
  transform(value: unknown): unknown {
    return sanitizeValue(value);
  }
}

function sanitizeValue(value: any): any {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (isPlainObject(value)) {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }
  return value;
}

const SCRIPT_TAG_REGEX = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const TAG_REGEX = /<[^>]+>/g;

function sanitizeString(input: string): string {
  const withoutScripts = input.replace(SCRIPT_TAG_REGEX, '');
  const withoutTags = withoutScripts.replace(TAG_REGEX, '');
  return withoutTags.trim();
}

function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
