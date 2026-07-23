import * as jose from "jose";
import { ENV } from "./env";

const secret = new TextEncoder().encode(ENV.cookieSecret);

export const sdk = {
  async createSessionToken(openId: string, userData: any): Promise<string> {
    const token = await new jose.SignJWT({
      sub: String(userData.id || openId),
      openId,
      name: userData.name || null,
      email: userData.email || null,
      role: userData.role || "user",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);
    return token;
  },

  async authenticateRequest(req: any): Promise<{ openId: string; role: string } | null> {
    try {
      const cookieHeader = req.headers?.cookie || "";
      const cookies = Object.fromEntries(
        cookieHeader.split(";").map((c: string) => {
          const [key, ...val] = c.trim().split("=");
          return [key, val.join("=")];
        })
      );
      let token = cookies["rabbaanie_session"] || null;
      if (!token) {
        const authHeader = req.headers?.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.slice(7);
        }
      }
      if (!token) return null;
      const { payload } = await jose.jwtVerify(token, secret);
      return {
        openId: (payload as any).openId || `user_${payload.sub}`,
        role: (payload as any).role || "user",
      };
    } catch {
      return null;
    }
  },
};
