import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { VaultInfo, VaultStructure, VaultStats } from "./types.js";

const OBSIDIAN_CONFIG = ".obsidian";
const CACHE_DIR = ".memoria";
const CACHE_NAMESPACE_PREFIX = "vault-";

/**
 * Find vault root by walking up looking for .obsidian folder
 */
export function findVault(cwd?: string): VaultInfo | null {
  let dir = path.resolve(cwd || process.cwd());

  while (dir !== path.dirname(dir)) {
    const configPath = path.join(dir, OBSIDIAN_CONFIG);
    if (fs.existsSync(configPath)) {
      return buildVaultInfo(dir);
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Build vault info from root path
 */
function buildVaultInfo(root: string): VaultInfo {
  const contentPath = root;
  const configPath = path.join(root, OBSIDIAN_CONFIG);

  const structure = detectStructure(contentPath);
  const stats = computeStats(contentPath);

  return {
    root,
    contentPath,
    configPath,
    structure,
    stats,
  };
}

/**
 * Detect vault structure patterns
 */
function detectStructure(contentPath: string): VaultStructure {
  const entries = fs.readdirSync(contentPath, { withFileTypes: true });
  const folders: string[] = [];
  let hasTags = false;
  let hasFrontmatter = false;
  let dateFormat: string | undefined;
  let roundPattern: string | undefined;

  // Check for date-based folders (e.g., 2024-01-15)
  const dateFolderPattern = /^\d{4}-\d{2}-\d{2}$/;
  const hasDateFolders = entries.some((e) => e.isDirectory() && dateFolderPattern.test(e.name));

  if (hasDateFolders) {
    dateFormat = "YYYY-MM-DD";

    // Check all date folders. The first one may be empty.
    for (const entry of entries) {
      if (!entry.isDirectory() || !dateFolderPattern.test(entry.name)) continue;
      const datePath = path.join(contentPath, entry.name);
      const dateEntries = fs.readdirSync(datePath);
      const roundMatch = dateEntries.find((f) => /^round-\d+\.md$/i.test(f));
      if (roundMatch) {
        roundPattern = "round-\\d+";
        break;
      }
    }
  }

  // Scan files for frontmatter and tags
  scanFiles(contentPath, (file) => {
    if (hasFrontmatter && hasTags) return;

    const content = fs.readFileSync(file, "utf-8");
    if (!hasFrontmatter && content.startsWith("---")) {
      hasFrontmatter = true;
    }
    if (!hasTags && /#[\w-]+/.test(content)) {
      hasTags = true;
    }
  });

  // Collect folders
  collectFolders(contentPath, folders, contentPath);

  return {
    dateFormat,
    roundPattern,
    hasTags,
    hasFrontmatter,
    folders,
  };
}

function scanFiles(dir: string, callback: (file: string) => void): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      scanFiles(fullPath, callback);
    } else if (entry.name.endsWith(".md")) {
      callback(fullPath);
    }
  }
}

function collectFolders(
  dir: string,
  folders: string[],
  rootDir: string,
  depth = 0,
  maxDepth = 3,
): void {
  if (depth > maxDepth) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const fullPath = path.join(dir, entry.name);
      folders.push(path.relative(rootDir, fullPath));
      collectFolders(fullPath, folders, rootDir, depth + 1, maxDepth);
    }
  }
}

function computeStats(contentPath: string): VaultStats {
  const files: { path: string; mtime: number; size: number }[] = [];
  let totalSize = 0;
  let totalFolders = 0;

  scanFiles(contentPath, (file) => {
    const stat = fs.statSync(file);
    files.push({ path: file, mtime: stat.mtimeMs, size: stat.size });
    totalSize += stat.size;
  });

  const scanFolders = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      totalFolders += 1;
      scanFolders(path.join(dir, entry.name));
    }
  };

  scanFolders(contentPath);

  const mtimes = files.map((f) => f.mtime);

  return {
    totalFiles: files.length,
    totalFolders,
    totalSize,
    oldestMtime: mtimes.length ? Math.min(...mtimes) : Date.now(),
    newestMtime: mtimes.length ? Math.max(...mtimes) : Date.now(),
  };
}

function getVaultCacheNamespace(vaultRoot: string): string {
  const normalized = path.resolve(vaultRoot);
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 12);
  return `${CACHE_NAMESPACE_PREFIX}${hash}`;
}

/**
 * Get cache root path for the directory where memoria was invoked.
 */
export function getCacheRoot(runDir: string): string {
  return path.join(path.resolve(runDir), CACHE_DIR);
}

/**
 * Get cache directory path for a specific vault.
 *
 * By default the cache is kept in the vault root for backward compatibility.
 * Pass runDir to keep cache in the execution directory instead.
 */
export function getCachePath(vaultRoot: string, runDir: string = vaultRoot): string {
  return path.join(getCacheRoot(runDir), getVaultCacheNamespace(vaultRoot));
}

/**
 * Ensure cache directories exist.
 * Returns the resolved vault-specific cache path.
 */
export function ensureCacheDir(vaultRoot: string, runDir: string = vaultRoot): string {
  const cacheRoot = getCacheRoot(runDir);
  const cachePath = getCachePath(vaultRoot, runDir);

  if (!fs.existsSync(cacheRoot)) {
    fs.mkdirSync(cacheRoot, { recursive: true });
  }

  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }

  return cachePath;
}
