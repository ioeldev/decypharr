import { z } from 'zod';

export const jsonObjectSchema = z.record(z.string(), z.json());
export type JsonObject = z.infer<typeof jsonObjectSchema>;
export type JsonValue = z.infer<ReturnType<typeof z.json>>;

export function objectValue(value: JsonValue | undefined): JsonObject {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;

  return {};
}

export function stringValue(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

export function numberValue(value: JsonValue | undefined): number {
  return typeof value === 'number' ? value : 0;
}

export function arrayValue(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
