import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { loadConfig } from "./config";

export interface Workspace {
  name: string;
  path: string;
  type: "node" | "python" | "rust";
  scripts: Record<string, string>;
  isSubmodule: boolean;
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
}

export function detectWorkspaceType(
  workspacePath: string,
): {
  type: "node" | "python" | "rust";
  scripts: Record<string, string>;
} | null {
  // Node.js
  const packageJsonPath = join(workspacePath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      return {
        type: "node",
        scripts: packageJson.scripts || {},
      };
    } catch {
      return null;
    }
  }

  // Python (uv)
  const pyprojectPath = join(workspacePath, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    // For now, return common Python scripts - we could parse TOML later
    return {
      type: "python",
      scripts: {
        build: "uv build",
        test: "uv run pytest",
        dev: "uv run python -m uvicorn main:app --reload",
        install: "uv sync",
      },
    };
  }

  // Rust
  const cargoTomlPath = join(workspacePath, "Cargo.toml");
  if (existsSync(cargoTomlPath)) {
    return {
      type: "rust",
      scripts: {
        build: "cargo build",
        test: "cargo test",
        check: "cargo check",
        clippy: "cargo clippy",
        run: "cargo run",
      },
    };
  }

  return null;
}

export function discoverWorkspaces(
  basePath: string = process.cwd(),
): Workspace[] {
  const config = loadConfig(basePath);
  const workspaces: Workspace[] = [];

  // Discover submodules
  const submodulesPath = join(basePath, config.submodules);
  if (existsSync(submodulesPath)) {
    const submoduleDirs = readdirSync(submodulesPath).filter((name) => {
      const fullPath = join(submodulesPath, name);
      return statSync(fullPath).isDirectory();
    });

    for (const dirName of submoduleDirs) {
      const workspacePath = join(submodulesPath, dirName);
      const detection = detectWorkspaceType(workspacePath);

      if (detection) {
        workspaces.push({
          name: dirName,
          path: workspacePath,
          type: detection.type,
          scripts: detection.scripts,
          packageManager: detectPackageManager(workspacePath),
          isSubmodule: true,
        });
      }
    }
  }

  // Discover packages
  const packagesPath = join(basePath, config.packages);
  if (existsSync(packagesPath)) {
    const packageDirs = readdirSync(packagesPath).filter((name) => {
      const fullPath = join(packagesPath, name);
      return statSync(fullPath).isDirectory();
    });

    for (const dirName of packageDirs) {
      const workspacePath = join(packagesPath, dirName);
      const detection = detectWorkspaceType(workspacePath);

      if (detection) {
        workspaces.push({
          name: dirName,
          path: workspacePath,
          type: detection.type,
          scripts: detection.scripts,
          packageManager: detectPackageManager(workspacePath),
          isSubmodule: false,
        });
      }
    }
  }

  return workspaces;
}
export function detectPackageManager(
  workspacePath: string,
): "npm" | "pnpm" | "yarn" | "bun" {
  try {
    const declared = JSON.parse(
      readFileSync(join(workspacePath, "package.json"), "utf-8"),
    ).packageManager?.split("@")[0];
    if (["npm", "pnpm", "yarn", "bun"].includes(declared)) return declared;
  } catch {
    /* Non-Node workspace or absent manifest. */
  }
  if (existsSync(join(workspacePath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(workspacePath, "yarn.lock"))) return "yarn";
  if (
    existsSync(join(workspacePath, "bun.lock")) ||
    existsSync(join(workspacePath, "bun.lockb"))
  )
    return "bun";
  return "npm";
}
