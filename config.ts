export class ConfigManager {
  static config(rootPath: string): void {
    // Minimal configuration hook used by the Jest global setup.
    // Store the resolved root path so other modules could reuse it if needed.
    process.env.PROJECT_ROOT = rootPath;
  }
}