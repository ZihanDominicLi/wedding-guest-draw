import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(12),
  WEDDING_DOMAIN: z.string().min(1),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  return envSchema.parse(input);
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

export const env = new Proxy({} as AppEnv, {
  get(_target, property: keyof AppEnv) {
    return getEnv()[property];
  },
});
