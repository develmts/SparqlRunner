/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/__tests__"],
  testMatch: ["**/*.test.ts"],
  //testMatch: ["**/src/v5/tests/**/*.test.ts"], // només executa els tests de v5
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": "ts-jest"
  },
  verbose: true,
  moduleNameMapper: {
    "^\\./services/NameService$": "<rootDir>/src/v5/services/NameService.ts",
  },
  globalSetup: "<rootDir>/jest.global-setup.ts",
  globalTeardown: "<rootDir>/jest.global-teardown.ts",
  // 👇 Coverage
  collectCoverage: true,
  collectCoverageFrom: [
    "src/v5/**/*.{ts,js}",   // tot el codi de V5
    "!src/v5/tests/**",      // exclou els tests
    "!**/node_modules/**"
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],

  // 👇 Llindars mínims de cobertura
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90
    }
  }
};
