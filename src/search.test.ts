import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  extractSnippets,
  relativeTime,
  computeFingerprint,
  listMarkdownFiles,
} from './search';
import { createTempVault, createMockDoc } from './test-utils';

describe('extractSnippets', () => {
  it('should extract lines matching query terms', () => {
    const content = `Line 1: apple
Line 2: banana
Line 3: apple pie`;

    const snippets = extractSnippets(content, 'apple', 0);

    expect(snippets).toHaveLength(2);
    expect(snippets[0].line).toBe(1);
    expect(snippets[1].line).toBe(3);
  });

  it('should return empty array when no matches', () => {
    const content = 'No matches here';

    const snippets = extractSnippets(content, 'xyz', 0);

    expect(snippets).toHaveLength(0);
  });

  it('should be case insensitive', () => {
    const content = 'Line 1: Apple\nLine 2: APPLE\nLine 3: apple';

    const snippets = extractSnippets(content, 'apple', 0);

    expect(snippets).toHaveLength(3);
  });

  it('should handle multiple query terms', () => {
    const content = `apple
banana
cherry`;

    const snippets = extractSnippets(content, 'apple banana', 0);

    expect(snippets).toHaveLength(2);
  });

  it('should expand context with snippet-lines', () => {
    const content = `Line 1
Line 2: apple
Line 3
Line 4`;

    const snippets = extractSnippets(content, 'apple', 1);

    // Should include line 2 and context lines 1 and 3
    expect(snippets.some(s => s.line === 1)).toBe(true);
    expect(snippets.some(s => s.line === 2)).toBe(true);
    expect(snippets.some(s => s.line === 3)).toBe(true);
  });

  it('should merge overlapping ranges when close', () => {
    const content = `Line 1: apple
Line 2: banana
Line 3: apple
Line 4: cherry`;

    // context=1 means lines 1-2 and 3-4, which should merge since line 2 and 3 overlap
    const snippets = extractSnippets(content, 'apple', 2);

    // Should contain matches
    expect(snippets.some(s => s.line === 1)).toBe(true);
    expect(snippets.some(s => s.line === 3)).toBe(true);
  });

  it('should skip empty lines', () => {
    const content = `Line 1: apple

Line 3: apple`;

    const snippets = extractSnippets(content, 'apple', 0);

    expect(snippets).toHaveLength(2);
  });

  it('should handle query with extra whitespace', () => {
    const content = 'Line 1: apple\nLine 2: banana';

    const snippets = extractSnippets(content, '  apple   banana  ', 0);

    expect(snippets).toHaveLength(2);
  });
});

describe('relativeTime', () => {
  it('should format minutes ago', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    expect(relativeTime(fiveMinutesAgo)).toBe('5m ago');
  });

  it('should format hours ago', () => {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    expect(relativeTime(threeHoursAgo)).toBe('3h ago');
  });

  it('should format days ago', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    expect(relativeTime(twoDaysAgo)).toBe('2d ago');
  });

  it('should format months ago', () => {
    const twoMonthsAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    expect(relativeTime(twoMonthsAgo)).toBe('2mo ago');
  });
});

describe('listMarkdownFiles', () => {
  it('should find markdown files recursively', async () => {
    const vault = await createTempVault({
      files: [
        { name: 'root.md', content: 'root' },
        { name: 'folder/nested.md', content: 'nested' },
        { name: 'folder/sub/deep.md', content: 'deep' },
      ],
    });

    const files = listMarkdownFiles(vault.dir);

    expect(files).toHaveLength(3);
    expect(files.some(f => f.endsWith('root.md'))).toBe(true);
    expect(files.some(f => f.endsWith('nested.md'))).toBe(true);
    expect(files.some(f => f.endsWith('deep.md'))).toBe(true);

    vault.cleanup();
  });

  it('should exclude hidden directories', async () => {
    const vault = await createTempVault({
      files: [
        { name: 'visible.md', content: 'visible' },
        { name: '.hidden/hidden.md', content: 'hidden' },
      ],
    });

    const files = listMarkdownFiles(vault.dir);

    expect(files.some(f => f.includes('visible.md'))).toBe(true);
    expect(files.some(f => f.includes('.hidden'))).toBe(false);

    vault.cleanup();
  });

  it('should exclude non-markdown files', async () => {
    const vault = await createTempVault({
      files: [
        { name: 'note.md', content: 'markdown' },
        { name: 'data.json', content: '{}' },
        { name: 'readme.txt', content: 'text' },
      ],
    });

    const files = listMarkdownFiles(vault.dir);

    expect(files).toHaveLength(1);
    expect(files[0].endsWith('.md')).toBe(true);

    vault.cleanup();
  });
});

describe('computeFingerprint', () => {
  it('should change when file content changes', async () => {
    const vault = await createTempVault({
      files: [{ name: 'test.md', content: 'original' }],
    });

    const fp1 = computeFingerprint(vault.dir);

    // Modify file
    fs.writeFileSync(path.join(vault.dir, 'test.md'), 'modified');
    const fp2 = computeFingerprint(vault.dir);

    expect(fp1).not.toBe(fp2);

    vault.cleanup();
  });

  it('should change when file mtime changes', async () => {
    const vault = await createTempVault({
      files: [{ name: 'test.md', content: 'content' }],
    });

    const fp1 = computeFingerprint(vault.dir);

    // Touch file
    const filePath = path.join(vault.dir, 'test.md');
    const newMtime = Date.now() + 10000;
    fs.utimesSync(filePath, new Date(newMtime), new Date(newMtime));

    const fp2 = computeFingerprint(vault.dir);

    expect(fp1).not.toBe(fp2);

    vault.cleanup();
  });

  it('should be consistent for same files', async () => {
    const vault = await createTempVault({
      files: [{ name: 'test.md', content: 'same content' }],
    });

    const fp1 = computeFingerprint(vault.dir);
    const fp2 = computeFingerprint(vault.dir);

    expect(fp1).toBe(fp2);

    vault.cleanup();
  });
});
