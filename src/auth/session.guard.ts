import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthService } from "./auth.service";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const session = await this.authService.getSession(req);
    if (!session?.user) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    }
    req.user = session.user;
    return true;
  }
}
