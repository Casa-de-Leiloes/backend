import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "mjs", "cjs", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  transform: {
    "^.+\\.(t|j)sx?$|^.+\\.mjs$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: false,
            decorators: true,
          },
          target: "es2021",
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
          },
        },
        module: {
          type: "commonjs",
        },
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@nestjs|nestjs-zod|zod|rxjs|@bullmq|bullmq|better-auth|@better-auth|better-call|@better-fetch|rou3|set-cookie-parser|@noble|nanostores|jose|defu|kysely)/)",
  ],
  collectCoverageFrom: ["**/*.(t|j)s", "!**/*.spec.(t|j)s", "!**/main.ts"],
  coverageDirectory: "../coverage",
  coverageThreshold: {
    global: {
      lines: 98,
      branches: 98,
      functions: 98,
      statements: 98,
    },
  },
  setupFiles: ["<rootDir>/../test/jest-setup.ts"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default config;
