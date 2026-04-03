import * as fs from 'fs';
import * as path from 'path';

export interface TempVault {
  dir: string;
  cleanup: () => void;
}

export interface VaultOptions {
  withObsidian?: boolean;
  files?: { name: string; content: string; mtime?: number }[];
  folders?: string[];
}

export async function createTempVault(options: VaultOptions = {}): Promise<TempVault> {
  const dir = fs.mkdtempSync('/tmp/memoria-test-');

  if (options.withObsidian !== false) {
    fs.mkdirSync(path.join(dir, '.obsidian'));
  }

  if (options.folders) {
    for (const folder of options.folders) {
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
    }
  }

  if (options.files) {
    for (const file of options.files) {
      const filePath = path.join(dir, file.name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content);
      if (file.mtime) {
        fs.utimesSync(filePath, new Date(file.mtime), new Date(file.mtime));
      }
    }
  }

  return {
    dir,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function createMockDoc(content: string, overrides: Partial<{
  id: number;
  file: string;
  basename: string;
  folder: string;
  mtime: number;
  size: number;
}> = {}): {
  id: number;
  file: string;
  basename: string;
  folder: string;
  content: string;
  mtime: number;
  size: number;
} {
  return {
    id: 0,
    file: 'test.md',
    basename: 'test',
    folder: '',
    content,
    mtime: Date.now(),
    size: content.length,
    ...overrides,
  };
}
