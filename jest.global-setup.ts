// jest.global-setup.ts
import path from "path";
import { ConfigManager } from "./config";

export default async function globalSetup() {
  // 1. Root path del projecte
  const rootPath = path.resolve(process.cwd());
  ConfigManager.config(rootPath);

  // 2. Secrets JWT per defecte (si no existeixen)
  if (!process.env.JWT_ACCESS_SECRET) {
    process.env.JWT_ACCESS_SECRET = "test_access_secret";
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
  }

  console.log("[jest.global-setup] ConfigManager initialized and JWT secrets set");
}
