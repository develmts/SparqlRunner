// jest.global-setup.ts
import * as path from "path";
import { ConfigManager } from "./src/ConfigManager"

export default async function globalSetup() {
  // 1. Root path del projecte
  const rootPath = path.resolve(process.cwd());
  ConfigManager.config(rootPath);

  console.log("[jest.global-setup] ConfigManager initialized");
}
