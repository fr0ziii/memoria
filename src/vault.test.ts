import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { findVault, getCachePath, ensureCacheDir } from './vault';
import { createTempVault } from './test-utils';

describe('findVault', () => {
  it('should find vault with .obsidian folder', async () => {
    const vault = await createTempVault({ withObsidian: true });

    const result = findVault(vault.dir);

    expect(result).not.toBeNull();
    expect(result!.root).toBe(vault.dir);

    vault.cleanup();
  });

  it('should return null when no .obsidian folder', async () => {
    const temp = fs.mkdtempSync('/tmp/no-vault-');

    const result = findVault(temp);

    expect(result).toBeNull();

    fs.rmSync(temp, { recursive: true });
  });

  it('should find vault by walking up directories', async () => {
    const vault = await createTempVault();
    const subdir = path.join(vault.dir, 'sub', 'deep');

    fs.mkdirSync(subdir, { recursive: true });

    const result = findVault(subdir);

    expect(result).not.toBeNull();
    expect(result!.root).toBe(vault.dir);

    vault.cleanup();
  });

  it('should detect date folder structure', async () => {
    const vault = await createTempVault({
      folders: ['2024-01-15', '2024-01-16'],
      files: [
        { name: '2024-01-15/round-1.md', content: 'note' },
        { name: '2024-01-15/round-2.md', content: 'note' },
      ],
    });

    const result = findVault(vault.dir);

    expect(result!.structure.dateFormat).toBe('YYYY-MM-DD');
    expect(result!.structure.roundPattern).toBe('round-\\d+');

    vault.cleanup();
  });

  it('should detect frontmatter in files', async () => {
    const vault = await createTempVault({
      files: [{ name: 'test.md', content: '---\ntitle: Test\n---\ncontent' }],
    });

    const result = findVault(vault.dir);

    expect(result!.structure.hasFrontmatter).toBe(true);

    vault.cleanup();
  });

  it('should detect tags in files', async () => {
    const vault = await createTempVault({
      files: [{ name: 'test.md', content: '#tag1\nSome #nested/tag content' }],
    });

    const result = findVault(vault.dir);

    expect(result!.structure.hasTags).toBe(true);

    vault.cleanup();
  });

  it('should collect folder list', async () => {
    const vault = await createTempVault({
      folders: ['folder1', 'folder1/sub1', 'folder2'],
      files: [
        { name: 'folder1/a.md', content: 'a' },
        { name: 'folder1/sub1/b.md', content: 'b' },
        { name: 'folder2/c.md', content: 'c' },
      ],
    });

    const result = findVault(vault.dir);

    // Folders are collected with path relative to vault root
    expect(result!.structure.folders.some(f => f.includes('folder1'))).toBe(true);
    expect(result!.structure.folders.some(f => f.includes('folder2'))).toBe(true);

    vault.cleanup();
  });

  it('should compute vault stats', async () => {
    const vault = await createTempVault({
      files: [
        { name: 'a.md', content: 'short' },
        { name: 'b.md', content: 'medium length content' },
      ],
    });

    const result = findVault(vault.dir);

    expect(result!.stats.totalFiles).toBe(2);
    expect(result!.stats.totalSize).toBeGreaterThan(0);

    vault.cleanup();
  });
});

describe('getCachePath', () => {
  it('should return namespaced cache path in vault root by default', () => {
    const cachePath = getCachePath('/some/vault');
    expect(cachePath).toMatch(/^\/some\/vault\/\.memoria\/vault-[a-f0-9]{12}$/);
  });

  it('should place cache under custom run directory', () => {
    const cachePath = getCachePath('/some/vault', '/tmp/run-dir');
    expect(cachePath).toMatch(/^\/tmp\/run-dir\/\.memoria\/vault-[a-f0-9]{12}$/);
  });
});

describe('ensureCacheDir', () => {
  it('should create cache directory if not exists', async () => {
    const vault = await createTempVault();
    const cachePath = path.join(vault.dir, '.memoria');

    expect(fs.existsSync(cachePath)).toBe(false);

    ensureCacheDir(vault.dir);

    expect(fs.existsSync(cachePath)).toBe(true);

    vault.cleanup();
  });

  it('should not fail if cache directory exists', async () => {
    const vault = await createTempVault();
    const cachePath = path.join(vault.dir, '.memoria');

    fs.mkdirSync(cachePath);

    expect(() => ensureCacheDir(vault.dir)).not.toThrow();

    vault.cleanup();
  });
});
