import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import MiniSearch from "minisearch";
import { bold, dim } from "./output.js";
import type { DocRecord, IndexCache, SearchResult, Snippet } from "./types.js";

const CACHE_FILE = "search-cache.json";

/**
 * Compute fingerprint of all markdown files
 */
export function computeFingerprint(contentPath: string): string {
  const files = listMarkdownFiles(contentPath);
  const entries: string[] = [];

  for (const file of files) {
    const stat = fs.statSync(file);
    entries.push(`${file}:${stat.mtimeMs}`);
  }

  return crypto.createHash("md5").update(entries.join("\n")).digest("hex");
}

/**
 * List all markdown files in vault
 */
export function listMarkdownFiles(contentPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        walk(fullPath);
      } else if (entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  walk(contentPath);
  return files;
}

/**
 * Load cached search index
 */
export function loadCache(cachePath: string, fingerprint: string): IndexCache | null {
  const cacheFile = path.join(cachePath, CACHE_FILE);
  try {
    const raw = fs.readFileSync(cacheFile, "utf-8");
    const data: IndexCache = JSON.parse(raw);
    if (data.fingerprint !== fingerprint) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Save search cache
 */
export function saveCache(cachePath: string, data: IndexCache): void {
  const cacheFile = path.join(cachePath, CACHE_FILE);
  fs.writeFileSync(cacheFile, JSON.stringify(data));
}

/**
 * Build search index from files
 */
export function buildIndex(
  contentPath: string,
): { index: MiniSearch; docs: DocRecord[]; backlinkCounts: Map<string, number> } {
  const files = listMarkdownFiles(contentPath);

  const docs: DocRecord[] = files.map((file, id) => {
    const content = fs.readFileSync(file, "utf-8");
    const stat = fs.statSync(file);
    const relativePath = path.relative(contentPath, file);
    const folder = path.dirname(relativePath);

    return {
      id,
      file: relativePath,
      basename: path.basename(file, ".md"),
      folder: folder === "." ? "" : folder,
      content,
      mtime: stat.mtimeMs,
      size: stat.size,
    };
  });

  const index = new MiniSearch({
    fields: ["basename", "content"],
    storeFields: ["file"],
    searchOptions: {
      boost: { basename: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  index.addAll(docs);

  // Build backlink counts
  const backlinkCounts = buildBacklinkCounts(docs, contentPath);

  return { index, docs, backlinkCounts };
}

/**
 * Extract wikilinks from content
 */
function extractLinks(content: string): string[] {
  const wikilinkPattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = wikilinkPattern.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
}

/**
 * Build map of file -> inbound link count
 */
function buildBacklinkCounts(docs: DocRecord[], contentPath: string): Map<string, number> {
  const counts = new Map<string, number>();
  const fileMap = new Map<string, string>();

  // Build map from basename to full relative path
  for (const doc of docs) {
    const fullPath = path.join(contentPath, doc.file);
    fileMap.set(doc.basename, doc.file);
    fileMap.set(doc.file, doc.file);
  }

  for (const doc of docs) {
    const links = extractLinks(doc.content);
    for (const link of links) {
      const targetFile = fileMap.get(link);
      if (targetFile) {
        counts.set(targetFile, (counts.get(targetFile) || 0) + 1);
      }
    }
  }

  return counts;
}

/**
 * Extract matching snippets from content
 */
export function extractSnippets(
  content: string,
  query: string,
  contextLines: number,
): Snippet[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  const lines = content.split("\n");
  const matchedLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (terms.some((t) => lower.includes(t))) {
      matchedLines.add(i);
    }
  }

  // Expand with context and merge overlapping ranges
  const ranges: [number, number][] = [];
  for (const lineIdx of [...matchedLines].sort((a, b) => a - b)) {
    const start = Math.max(0, lineIdx - contextLines);
    const end = Math.min(lines.length - 1, lineIdx + contextLines);
    if (ranges.length > 0 && start <= ranges[ranges.length - 1][1] + 1) {
      ranges[ranges.length - 1][1] = end;
    } else {
      ranges.push([start, end]);
    }
  }

  const snippets: Snippet[] = [];
  for (const [start, end] of ranges) {
    for (let i = start; i <= end; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      snippets.push({ line: i + 1, text: line });
    }
  }

  return snippets;
}

/**
 * Format relative time
 */
export function relativeTime(mtimeMs: number): string {
  const diff = Date.now() - mtimeMs;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Search interface
 */
export interface SearchOptions {
  query: string;
  vaultPath: string;
  cachePath: string;
  limit?: number;
  snippetLines?: number;
  showScore?: boolean;
  showLinks?: boolean;
  folder?: string;
  json?: boolean;
}

/**
 * Execute search
 */
export function search(options: SearchOptions): SearchResult[] {
  const { query, vaultPath, cachePath, limit = 10, snippetLines = 0, showScore, showLinks } = options;

  const fingerprint = computeFingerprint(vaultPath);
  const cached = loadCache(cachePath, fingerprint);

  let index: MiniSearch;
  let docs: DocRecord[];
  let backlinkCounts: Map<string, number>;

  if (cached) {
    // Restore from cache
    index = MiniSearch.loadJSON(cached.index, {
      fields: ["basename", "content"],
      storeFields: ["file"],
      searchOptions: {
        boost: { basename: 2 },
        fuzzy: 0.2,
        prefix: true,
      },
    });

    docs = cached.docs.map((d) => {
      const fullPath = path.join(vaultPath, d.file);
      const content = fs.readFileSync(fullPath, "utf-8");
      return { ...d, content };
    });

    backlinkCounts = new Map(Object.entries(cached.backlinkCounts));
  } else {
    // Build fresh
    const built = buildIndex(vaultPath);
    index = built.index;
    docs = built.docs;
    backlinkCounts = built.backlinkCounts;

    // Cache
    saveCache(cachePath, {
      fingerprint,
      index: JSON.stringify(index),
      docs: docs.map(({ content: _, ...rest }) => rest),
      backlinkCounts: Object.fromEntries(backlinkCounts),
    });
  }

  const results = index.search(query);

  // Compute composite scores
  const maxMtime = Math.max(...docs.map((d) => d.mtime));
  const minMtime = Math.min(...docs.map((d) => d.mtime));
  const mtimeRange = maxMtime - minMtime || 1;

  const scored = results.map((r) => {
    const doc = docs[r.id];
    const bm25Score = r.score;
    const links = backlinkCounts.get(doc.file) || 0;
    const recency = (doc.mtime - minMtime) / mtimeRange;

    // Composite: BM25 dominates, backlinks and recency are boosters
    const composite = bm25Score + links * 0.5 + recency * 1.0;

    return {
      file: doc.file,
      basename: doc.basename,
      folder: doc.folder,
      score: Math.round(composite * 10) / 10,
      links,
      modified: relativeTime(doc.mtime),
      snippets:
        snippetLines > 0
          ? extractSnippets(doc.content, query, snippetLines)
          : [],
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Read file content
 */
export function readFile(vaultPath: string, file: string): string | null {
  const fullPath = path.join(vaultPath, file);
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}
