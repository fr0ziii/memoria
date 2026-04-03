export interface DocRecord {
  id: number;
  file: string;
  basename: string;
  folder: string;
  content: string;
  mtime: number;
  size: number;
}

export interface SearchResult {
  file: string;
  basename: string;
  folder: string;
  score: number;
  modified: string;
  links: number;
  snippets: Snippet[];
}

export interface Snippet {
  line: number;
  text: string;
}

export interface VaultInfo {
  root: string;
  contentPath: string;
  configPath: string;
  structure: VaultStructure;
  stats: VaultStats;
}

export interface VaultStructure {
  dateFormat?: string;
  roundPattern?: string;
  hasTags: boolean;
  hasFrontmatter: boolean;
  folders: string[];
}

export interface VaultStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  oldestMtime: number;
  newestMtime: number;
}

export interface IndexCache {
  fingerprint: string;
  index: string;
  docs: Array<{
    id: number;
    file: string;
    basename: string;
    folder: string;
    mtime: number;
    size: number;
  }>;
  backlinkCounts: Record<string, number>;
}
