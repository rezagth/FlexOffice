import { z } from "zod";

export const createTicketSchema = z.object({
  email: z.email().max(255),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
