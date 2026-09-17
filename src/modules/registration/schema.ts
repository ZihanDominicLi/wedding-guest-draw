import { z } from "zod";

export const guestRelationSchema = z.enum([
  "GROOM_RELATIVE",
  "BRIDE_RELATIVE",
  "GROOM_FRIEND",
  "BRIDE_FRIEND",
  "MUTUAL_FRIEND",
  "COLLEAGUE",
  "CLASSMATE",
  "OTHER",
]);

export const registrationSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    phoneLast4: z.string().regex(/^\d{4}$/),
    relation: guestRelationSchema,
    childCount: z.number().int().min(0).max(20),
    originProvince: z.string().trim().min(1).max(30),
    originCity: z.string().trim().min(1).max(30),
    deviceHash: z.string().min(16).max(128).optional(),
  })
  .strict();

export type RegistrationInput = z.infer<typeof registrationSchema>;
