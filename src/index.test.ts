import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import { createTempVault } from './test-utils';

const CLI_PATH = path.join(__dirname, 'index.ts');

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[], cwd?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const proc = spawn('bun', [CLI_PATH, ...args], {
      cwd: cwd || process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

describe('CLI', () => {
  let vault: Awaited<ReturnType<typeof createTempVault>>;

  beforeEach(async () => {
    vault = await createTempVault({
      files: [
        { name: 'AGENTS.md', content: '# AGENTS\n\nThis is about agents and AI.\n\nSee [[Architecture]] for details.' },
        { name: 'Architecture.md', content: '# Architecture\n\nSystem architecture notes.\n\nRelated to [[AGENTS]].' },
        { name: '2024-01-15/round-1.md', content: '# Round 1\n\nDiscussion about authentication.\n\n## Topics\n- Auth\n- Tokens' },
        { name: 'engineering/notes.md', content: '# Engineering Notes\n\nCode and stuff.' },
      ],
    });
  });

  afterEach(() => {
    vault.cleanup();
  });

  describe('vault command', () => {
    it('should show vault info', async () => {
      const result = await runCli(['vault'], vault.dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('root:');
      expect(result.stdout).toContain('files: 4');
    });

    it('should show JSON output with --json flag', async () => {
      const result = await runCli(['vault', '--json'], vault.dir);

      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      // Normalize both paths (macOS uses /private/tmp)
      const normalizedResult = data.root.replace('/private/', '/');
      const normalizedVault = vault.dir.replace('/private/', '/');
      expect(normalizedResult).toBe(normalizedVault);
      expect(data.stats.totalFiles).toBe(4);
    });

    it('should error when not in vault', async () => {
      const result = await runCli(['vault'], '/tmp');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Not in an Obsidian vault');
    });
  });

  describe('search command', () => {
    it('should search notes', async () => {
      const result = await runCli(['search', 'agents'], vault.dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('AGENTS.md');
    });

    it('should show modified time', async () => {
      const result = await runCli(['search', 'agents'], vault.dir);

      expect(result.stdout).toMatch(/\d+[mhd] ago\)/);
    });

    it('should show scores with --score flag', async () => {
      const result = await runCli(['search', 'agents', '--score'], vault.dir);

      expect(result.stdout).toContain('score:');
    });

    it('should show snippets with --snippet-lines', async () => {
      const result = await runCli(['search', 'agents', '--snippet-lines', '1'], vault.dir);

      expect(result.stdout).toContain('AGENTS');
    });

    it('should return JSON with --json flag', async () => {
      const result = await runCli(['search', 'agents', '--json'], vault.dir);

      const data = JSON.parse(result.stdout);
      expect(data.results).toBeDefined();
      expect(Array.isArray(data.results)).toBe(true);
    });

    it('should limit results with --limit', async () => {
      const result = await runCli(['search', 'a', '--limit', '2'], vault.dir);

      const lines = result.stdout.trim().split('\n').filter(l => l.includes('.md'));
      expect(lines.length).toBeLessThanOrEqual(2);
    });

    it('should show "No results" for empty query', async () => {
      const result = await runCli(['search'], vault.dir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No query');
    });

    it('should show hint about read command', async () => {
      const result = await runCli(['search', 'agents'], vault.dir);

      expect(result.stdout).toContain('HINT');
      expect(result.stdout).toContain('memoria read');
    });
  });

  describe('read command', () => {
    it('should read file content', async () => {
      const result = await runCli(['read', 'AGENTS.md'], vault.dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('AGENTS');
      expect(result.stdout).toContain('agents and AI');
    });

    it('should read file without extension', async () => {
      const result = await runCli(['read', 'AGENTS'], vault.dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('AGENTS');
    });

    it('should read file in subfolder', async () => {
      const result = await runCli(['read', 'engineering/notes.md'], vault.dir);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Engineering Notes');
    });

    it('should return error for non-existent file', async () => {
      const result = await runCli(['read', 'nonexistent.md'], vault.dir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should show error for missing file argument', async () => {
      const result = await runCli(['read'], vault.dir);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No file specified');
    });
  });

  describe('help', () => {
    it('should show help with --help', async () => {
      const result = await runCli(['--help'], vault.dir);

      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('search');
      expect(result.stdout).toContain('read');
      expect(result.stdout).toContain('vault');
    });

    it('should show help with -h', async () => {
      const result = await runCli(['-h'], vault.dir);

      expect(result.stdout).toContain('Commands:');
    });
  });
});
