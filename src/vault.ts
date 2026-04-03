import * as fs from "fs";
import * as path from "path";
import type { VaultInfo, VaultStructure, VaultStats } from "./types.js";

const OBSIDIAN_CONFIG = ".obsidian";
const CACHE_DIR = ".memoria";

/**
 * Find vault root by walking up looking for .obsidian folder
 */
export function findVault(cwd?: string): VaultInfo | null {
  let dir = cwd || process.cwd();

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

    // Check for round pattern inside date folders
    const firstDateFolder = entries.find((e) => e.isDirectory() && dateFolderPattern.test(e.name));
    if (firstDateFolder) {
      const datePath = path.join(contentPath, firstDateFolder.name);
      const dateEntries = fs.readdirSync(datePath);
      const roundMatch = dateEntries.find((f) => f.match(/^round-\d+\.md$/i));
      if (roundMatch) {
        roundPattern = "round-\\d+";
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
  collectFolders(contentPath, folders);

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

function collectFolders(dir: string, folders: string[], depth = 0, maxDepth = 3): void {
  if (depth > maxDepth) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const relativePath = path.relative(dir, path.join(dir, entry.name));
      folders.push(relativePath);
      collectFolders(path.join(dir, entry.name), folders, depth + 1, maxDepth);
    }
  }
}

function computeStats(contentPath: string): VaultStats {
  const files: { path: string; mtime: number; size: number }[] = [];
  let totalSize = 0;

  scanFiles(contentPath, (file) => {
    const stat = fs.statSync(file);
    files.push({ path: file, mtime: stat.mtimeMs, size: stat.size });
    totalSize += stat.size;
  });

  const mtimes = files.map((f) => f.mtime);

  return {
    totalFiles: files.length,
    totalFolders: 0,
    totalSize,
    oldestMtime: mtimes.length ? Math.min(...mtimes) : Date.now(),
    newestMtime: mtimes.length ? Math.max(...mtimes) : Date.now(),
  };
}

/**
 * Get cache directory path
 */
export function getCachePath(vaultRoot: string): string {
  return path.join(vaultRoot, CACHE_DIR);
}

/**
 * Ensure cache directory exists
 */
export function ensureCacheDir(vaultRoot: string): void {
  const cachePath = getCachePath(vaultRoot);
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }
}
