import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { IdentityService } from "./identity.service";
import { SessionGuard } from "./session.guard";
import { RolesGuard } from "./roles.guard";

@Module({
  providers: [AuthService, IdentityService, SessionGuard, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, IdentityService, SessionGuard, RolesGuard],
})
export class AuthModule {}
