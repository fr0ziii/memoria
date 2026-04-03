import * as path from "path";
import {
  computeFingerprint,
  invalidateCache,
  listMarkdownFiles,
  readFile,
  search,
  type SearchOptions,
} from "./search.js";
import { ensureCacheDir, findVault } from "./vault.js";
import type { SearchResult, VaultInfo } from "./types.js";

export interface MemoriaRuntime {
  runDir: string;
  cachePath: string;
  vault: VaultInfo;
}

export interface MemoriaSearchInput {
  query: string;
  limit?: number;
  snippetLines?: number;
  showScore?: boolean;
  showLinks?: boolean;
  folder?: string;
}

export interface IndexResult {
  removed: boolean;
  fingerprint: string;
}

export interface TruncationResult {
  content: string;
  truncated: boolean;
  totalLines: number;
  outputLines: number;
  totalBytes: number;
  outputBytes: number;
}

export function resolveRuntime(runDir: string, vaultOption?: string): MemoriaRuntime {
  const resolvedRunDir = path.resolve(runDir);
  const requestedVaultPath = vaultOption
    ? path.resolve(resolvedRunDir, vaultOption)
    : resolvedRunDir;

  const vault = findVault(requestedVaultPath);
  if (!vault) {
    if (vaultOption) {
      throw new Error(`Could not find Obsidian vault from path: ${vaultOption}`);
    }
    throw new Error("Not in an Obsidian vault (no .obsidian folder found)");
  }

  const cachePath = ensureCacheDir(vault.root, resolvedRunDir);
  return {
    runDir: resolvedRunDir,
    cachePath,
    vault,
  };
}

export function runSearch(runtime: MemoriaRuntime, input: MemoriaSearchInput): SearchResult[] {
  const query = input.query.trim();
  if (!query) {
    throw new Error("No query specified");
  }

  const options: SearchOptions = {
    query,
    vaultPath: runtime.vault.contentPath,
    cachePath: runtime.cachePath,
    limit: clamp(input.limit ?? 10, 1, 200),
    snippetLines: clamp(input.snippetLines ?? 0, 0, 20),
    showScore: input.showScore,
    showLinks: input.showLinks,
    folder: input.folder,
  };

  return search(options);
}

export function runRead(runtime: MemoriaRuntime, file: string): { file: string; content: string } {
  const requested = file.trim();
  if (!requested) {
    throw new Error("No file specified");
  }

  const exact = readFile(runtime.vault.contentPath, requested);
  if (exact !== null) {
    return { file: requested, content: exact };
  }

  if (!requested.endsWith(".md")) {
    const withExtension = `${requested}.md`;
    const extended = readFile(runtime.vault.contentPath, withExtension);
    if (extended !== null) {
      return { file: withExtension, content: extended };
    }
  }

  const matched = matchBySuffix(runtime.vault.contentPath, requested);
  if (matched) {
    const content = readFile(runtime.vault.contentPath, matched);
    if (content !== null) {
      return { file: matched, content };
    }
  }

  throw new Error(`File not found: ${requested}`);
}

export function runIndex(runtime: MemoriaRuntime, rebuild: boolean): IndexResult {
  if (!rebuild) {
    throw new Error("Use --rebuild to force cache rebuild.");
  }

  const removed = invalidateCache(runtime.cachePath);
  const fingerprint = computeFingerprint(runtime.vault.contentPath);
  return { removed, fingerprint };
}

function matchBySuffix(vaultPath: string, requested: string): string | null {
  const normalizedRequested = normalizePath(requested);
  const normalizedRequestedWithoutExt = normalizedRequested.replace(/\.md$/i, "");

  const files = listMarkdownFiles(vaultPath);
  for (const absoluteFile of files) {
    const relativeFile = normalizePath(path.relative(vaultPath, absoluteFile));
    const withoutExt = relativeFile.replace(/\.md$/i, "");

    if (
      relativeFile === normalizedRequested ||
      withoutExt === normalizedRequestedWithoutExt ||
      relativeFile.endsWith(`/${normalizedRequested}`) ||
      withoutExt.endsWith(`/${normalizedRequestedWithoutExt}`)
    ) {
      return relativeFile;
    }
  }

  return null;
}

function normalizePath(input: string): string {
  return input.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const normalized = Math.trunc(value);
  if (normalized < min) return min;
  if (normalized > max) return max;
  return normalized;
}

export function truncateForToolOutput(
  content: string,
  maxLines = 2000,
  maxBytes = 50 * 1024,
): TruncationResult {
  const lines = content.split("\n");
  const totalBytes = Buffer.byteLength(content, "utf8");
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      totalLines,
      outputLines: totalLines,
      totalBytes,
      outputBytes: totalBytes,
    };
  }

  let keptLines = lines.slice(0, maxLines);
  let output = keptLines.join("\n");

  while (Buffer.byteLength(output, "utf8") > maxBytes && keptLines.length > 0) {
    keptLines = keptLines.slice(0, -1);
    output = keptLines.join("\n");
  }

  const outputBytes = Buffer.byteLength(output, "utf8");

  return {
    content: output,
    truncated: true,
    totalLines,
    outputLines: keptLines.length,
    totalBytes,
    outputBytes,
  };
}
