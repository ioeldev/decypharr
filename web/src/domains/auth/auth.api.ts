import { z } from 'zod';

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  needs_registration: z.boolean(),
  token_only: z.boolean(),
  setup_required: z.boolean(),
});
