import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import * as jose from "jose";
import { ENV } from "./env";

export interface User {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: string;
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const COOKIE_NAME = "rabbaanie_session";

async function getSessionUser(req: any): Promise<User | null> {
  try {
    let token: string | null = null;
    const cookieHeader = req.headers?.cookie || "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c: string) => {
        const [key, ...val] = c.trim().split("=");
        return [key, val.join("=")];
      })
    );
    token = cookies[COOKIE_NAME] || null;
    if (!token) {
      const authHeader = req.headers?.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      }
    }
    if (!token) return null;
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jose.jwtVerify(token, secret);
    if (!payload.sub) return null;
    return {
      id: Number(payload.sub),
      openId: (payload as any).openId || `user_${payload.sub}`,
      name: (payload as any).name || null,
      email: (payload as any).email || null,
      role: (payload as any).role || "user",
    };
  } catch {
    return null;
  }
}

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const user = await getSessionUser(opts.req);
  return { req: opts.req, res: opts.res, user };
}
