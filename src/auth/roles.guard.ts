import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@prisma/client";
import { ROLES_KEY } from "./roles.decorator";

interface RequestUser {
  id: string;
  role: Role;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!req.user) {
      throw new ForbiddenException({ code: "FORBIDDEN_ROLE" });
    }
    if (!requiredRoles.includes(req.user.role)) {
      throw new ForbiddenException({ code: "FORBIDDEN_ROLE" });
    }
    return true;
  }
}
