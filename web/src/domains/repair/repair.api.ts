import { z } from 'zod';
import { jsonObjectSchema } from '../../shared/api/json-response';

export const recordsSchema = z.array(jsonObjectSchema).nullable().transform((records) => records ?? []);
export const healthStates = ['healthy', 'broken', 'repairing', 'stale', 'unknown', 'unsupported'];
