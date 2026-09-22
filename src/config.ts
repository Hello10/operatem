import { readFileSync } from "fs";
import { join } from "path";

export interface OperatemConfig {
  submodules: string;
  packages: string;
}

const DEFAULT_CONFIG: OperatemConfig = {
  submodules: "submodules",
  packages: "packages",
};

export function loadConfig(basePath = process.cwd()): OperatemConfig {
  try {
    // Look for operatem.json in current working directory
    const configPath = join(basePath, "operatem.json");
    const configFile = readFileSync(configPath, "utf-8");
    const config = JSON.parse(configFile) as Partial<OperatemConfig>;

    return {
      ...DEFAULT_CONFIG,
      ...config,
    };
  } catch {
    // Return default config if file doesn't exist or is invalid
    return DEFAULT_CONFIG;
  }
}
