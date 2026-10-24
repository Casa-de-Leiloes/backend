import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { AppEnv } from "./config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService<AppEnv, true>);
  const frontendOrigin = config.get("FRONTEND_ORIGIN", { infer: true });
  const port = config.get("PORT", { infer: true });

  app.use(helmet());

  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  });

  app.setGlobalPrefix("api", { exclude: ["health/live", "health/ready"] });

  await app.listen(port);
}

bootstrap();
