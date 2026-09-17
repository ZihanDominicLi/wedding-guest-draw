import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashAdminPassword, verifyAdminPassword } from "@/lib/password";

export const auth = betterAuth({
  appName: "婚礼现场工作台",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, {
    provider: "postgresql",
    transaction: true,
  }),
  user: {
    modelName: "adminUser",
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    password: {
      hash: hashAdminPassword,
      verify: verifyAdminPassword,
    },
  },
  session: {
    expiresIn: 60 * 60 * 12,
    freshAge: 60 * 30,
  },
  advanced: {
    cookiePrefix: "wedding-draw",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export async function requireAdmin(requestHeaders: Headers): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session?.user) {
    throw new UnauthorizedError();
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}

export async function requireFreshAdmin(
  requestHeaders: Headers,
  maxAgeMinutes = 30,
): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) throw new UnauthorizedError();
  const createdAt = new Date(session.session.createdAt).getTime();
  if (Date.now() - createdAt > maxAgeMinutes * 60 * 1000) {
    throw new FreshAuthenticationRequiredError();
  }
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Administrator session required");
    this.name = "UnauthorizedError";
  }
}

export class FreshAuthenticationRequiredError extends Error {
  constructor() {
    super("Recent administrator authentication required");
    this.name = "FreshAuthenticationRequiredError";
  }
}
