import { hash, verify } from "argon2";

export function hashAdminPassword(password: string): Promise<string> {
  return hash(password, { type: 2 });
}

export function verifyAdminPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return verify(input.hash, input.password);
}
