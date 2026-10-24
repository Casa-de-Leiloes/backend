import type { BetterAuthUser } from "../auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      user?: BetterAuthUser;
    }
  }
}
