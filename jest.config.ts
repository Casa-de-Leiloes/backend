import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: false,
          decorators: true,
        },
        target: 'es2021',
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
      module: {
        type: 'commonjs',
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@nestjs|nestjs-zod|zod|rxjs|@bullmq|bullmq)/)',
  ],
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.spec.(t|j)s', '!**/main.ts'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      lines: 98,
      branches: 98,
      functions: 98,
      statements: 98,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

export default config;
