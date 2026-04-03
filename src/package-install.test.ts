import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = path.resolve(__dirname, '..');

function runPi(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
) {
  return spawnSync('pi', args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000,
  });
}

function hasPiCli(): boolean {
  const result = spawnSync('pi', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

describe('pi package manifest', () => {
  it('declares existing pi resources and package files', () => {
    const pkg = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')) as {
      pi: { extensions: string[]; skills: string[] };
      files: string[];
    };

    for (const extensionPath of pkg.pi.extensions) {
      const resolved = path.join(PROJECT_ROOT, extensionPath);
      expect(existsSync(resolved), `missing extension path: ${extensionPath}`).toBe(true);
    }

    for (const skillPath of pkg.pi.skills) {
      const resolved = path.join(PROJECT_ROOT, skillPath);
      expect(existsSync(resolved), `missing skill path: ${skillPath}`).toBe(true);
    }

    for (const fileEntry of pkg.files) {
      const normalized = fileEntry.endsWith('/') ? fileEntry.slice(0, -1) : fileEntry;
      const resolved = path.join(PROJECT_ROOT, normalized);
      expect(existsSync(resolved), `missing files[] path: ${fileEntry}`).toBe(true);
    }
  });

  const maybeIt = hasPiCli() ? it : it.skip;

  maybeIt('supports global pi install from local path', () => {
    const agentDir = mkdtempSync(path.join(os.tmpdir(), 'memoria-pi-global-'));

    try {
      const install = runPi(['install', PROJECT_ROOT], {
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      });

      expect(install.status, install.stderr || install.stdout).toBe(0);

      const list = runPi(['list'], {
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      });

      expect(list.status, list.stderr || list.stdout).toBe(0);
      expect(list.stdout).toContain(PROJECT_ROOT);
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });

  maybeIt('supports project-local pi install from local path', () => {
    const agentDir = mkdtempSync(path.join(os.tmpdir(), 'memoria-pi-agent-'));
    const projectDir = mkdtempSync(path.join(os.tmpdir(), 'memoria-pi-project-'));

    try {
      const install = runPi(['install', '-l', PROJECT_ROOT], {
        cwd: projectDir,
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      });

      expect(install.status, install.stderr || install.stdout).toBe(0);

      const settingsPath = path.join(projectDir, '.pi', 'settings.json');
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { packages?: string[] };

      expect(Array.isArray(settings.packages)).toBe(true);

      const resolvedPackages = (settings.packages ?? []).map((entry) => {
        if (entry.startsWith('npm:') || entry.startsWith('git:') || entry.startsWith('http://') || entry.startsWith('https://') || entry.startsWith('ssh://')) {
          return entry;
        }
        return path.resolve(path.join(projectDir, '.pi'), entry);
      });

      expect(resolvedPackages).toContain(PROJECT_ROOT);
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
