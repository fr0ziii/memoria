/**
 * Minimal output utilities — no decorative clutter
 */

export function bold(text: string): string {
  return text;
}

export function dim(text: string): string {
  return text;
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatVaultInfo(info: {
  root: string;
  structure: {
    dateFormat?: string;
    roundPattern?: string;
    hasTags: boolean;
    folders: string[];
  };
  stats: {
    totalFiles: number;
    totalSize: number;
    oldestMtime: number;
    newestMtime: number;
  };
}): string {
  const lines: string[] = [
    `root: ${info.root}`,
    `files: ${info.stats.totalFiles}`,
    `size: ${formatBytes(info.stats.totalSize)}`,
  ];

  if (info.structure.dateFormat) {
    lines.push(`date format: ${info.structure.dateFormat}`);
  }
  if (info.structure.roundPattern) {
    lines.push(`round pattern: ${info.structure.roundPattern}`);
  }
  if (info.structure.folders.length > 0) {
    lines.push(`folders: ${info.structure.folders.length}`);
  }

  return lines.join("\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
