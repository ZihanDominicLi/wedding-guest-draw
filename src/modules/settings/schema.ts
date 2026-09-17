import { z } from "zod";

export const weddingSettingsSchema = z.object({
  groomName: z.string().trim().max(40),
  brideName: z.string().trim().max(40),
  weddingDate: z.string().date().or(z.literal("")),
  venueProvince: z.string().trim().max(30),
  venueCity: z.string().trim().max(30),
  registrationOpen: z.boolean(),
  formalDrawMode: z.boolean(),
  screenTitle: z.string().trim().min(1).max(80),
});
