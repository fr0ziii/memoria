import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { formatJson } from "../../../dist/output.js";
import {
  resolveRuntime,
  runIndex,
  runRead,
  runSearch,
  truncateForToolOutput,
  type MemoriaSearchInput,
} from "../../../dist/runtime.js";
import type { SearchResult } from "../../../dist/types.js";

type ParsedOptions = Record<string, string | boolean>;

const HELP_TEXT = [
  "memoria commands:",
  "  /memoria vault [--vault <path>] [--json]",
  "  /memoria search <query> [--vault <path>] [--limit <n>] [--snippet-lines <n>] [--folder <path>] [--score] [--links] [--json]",
  "  /memoria read <file> [--vault <path>] [--json]",
  "  /memoria index --rebuild [--vault <path>]",
].join("\n");

export default function memoriaExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "memoria_search",
    label: "Memoria Search",
    description: "Searches Obsidian vault notes by BM25 relevance with recency and backlinks.",
    promptSnippet: "Searches vault notes with BM25 + recency + backlinks and returns ranked files",
    promptGuidelines: [
      "Use this tool first when user asks about personal notes or prior context in their vault.",
      "Use snippet_lines sparingly to reduce output size.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search terms" }),
      vault: Type.Optional(Type.String({ description: "Optional vault path. Default: current working directory" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 10)" })),
      snippet_lines: Type.Optional(Type.Number({ description: "Context lines around matches (default: 0)" })),
      folder: Type.Optional(Type.String({ description: "Limit search to a folder" })),
      score: Type.Optional(Type.Boolean({ description: "Include scores in output" })),
      links: Type.Optional(Type.Boolean({ description: "Include backlink counts in output" })),
      rebuild: Type.Optional(Type.Boolean({ description: "Invalidate cache before searching" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(ctx.cwd, params.vault);

      if (params.rebuild) {
        runIndex(runtime, true);
      }

      const results = runSearch(runtime, {
        query: params.query,
        limit: params.limit,
        snippetLines: params.snippet_lines,
        showScore: params.score,
        showLinks: params.links,
        folder: params.folder,
      });

      const payload = {
        vault: runtime.vault.root,
        cache: runtime.cachePath,
        query: params.query,
        results,
      };

      const text = formatJson(payload);
      const truncated = truncateForToolOutput(text);

      return {
        content: [{ type: "text", text: appendTruncationMessage(truncated) }],
        details: {
          ...payload,
          truncated: truncated.truncated,
          totalLines: truncated.totalLines,
          outputLines: truncated.outputLines,
          totalBytes: truncated.totalBytes,
          outputBytes: truncated.outputBytes,
        },
      };
    },
  });

  pi.registerTool({
    name: "memoria_read",
    label: "Memoria Read",
    description: "Reads full content of a vault note by filename or path.",
    promptSnippet: "Reads note content from the Obsidian vault",
    promptGuidelines: [
      "Use this after memoria_search to open top matching files.",
      "Prefer exact file path from search results when possible.",
    ],
    parameters: Type.Object({
      file: Type.String({ description: "Filename or relative path" }),
      vault: Type.Optional(Type.String({ description: "Optional vault path. Default: current working directory" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(ctx.cwd, params.vault);
      const result = runRead(runtime, params.file);

      const truncated = truncateForToolOutput(result.content);

      return {
        content: [{ type: "text", text: appendTruncationMessage(truncated) }],
        details: {
          vault: runtime.vault.root,
          file: result.file,
          truncated: truncated.truncated,
          totalLines: truncated.totalLines,
          outputLines: truncated.outputLines,
          totalBytes: truncated.totalBytes,
          outputBytes: truncated.outputBytes,
        },
      };
    },
  });

  pi.registerTool({
    name: "memoria_vault",
    label: "Memoria Vault",
    description: "Shows vault and cache info for the current execution directory.",
    promptSnippet: "Shows vault root, detected structure, stats, and cache path",
    parameters: Type.Object({
      vault: Type.Optional(Type.String({ description: "Optional vault path. Default: current working directory" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(ctx.cwd, params.vault);

      const payload = {
        root: runtime.vault.root,
        cache: runtime.cachePath,
        structure: runtime.vault.structure,
        stats: runtime.vault.stats,
      };

      return {
        content: [{ type: "text", text: formatJson(payload) }],
        details: payload,
      };
    },
  });

  pi.registerTool({
    name: "memoria_index",
    label: "Memoria Index",
    description: "Rebuilds the search cache by invalidating previous cache files.",
    promptSnippet: "Invalidates and rebuilds vault search cache when needed",
    parameters: Type.Object({
      rebuild: Type.Optional(Type.Boolean({ description: "Force cache invalidation" })),
      vault: Type.Optional(Type.String({ description: "Optional vault path. Default: current working directory" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = resolveRuntime(ctx.cwd, params.vault);
      if (params.rebuild === false) {
        return {
          content: [{ type: "text", text: "Use rebuild=true to invalidate cache." }],
          details: {
            vault: runtime.vault.root,
            cache: runtime.cachePath,
            rebuilt: false,
          },
        };
      }

      const result = runIndex(runtime, true);
      const message = result.removed
        ? "Cache invalidated. Next search will rebuild index."
        : "No cache file found. Next search will build index.";

      return {
        content: [{ type: "text", text: `${message}\nFingerprint: ${result.fingerprint}` }],
        details: {
          vault: runtime.vault.root,
          cache: runtime.cachePath,
          rebuilt: true,
          removed: result.removed,
          fingerprint: result.fingerprint,
        },
      };
    },
  });

  pi.registerCommand("memoria", {
    description: "Memoria CLI command (vault, search, read, index)",
    handler: async (args, ctx) => {
      try {
        const parsed = parseCliArgs(args);
        const subcommand = parsed.command;

        if (!subcommand || subcommand === "help") {
          emitCliMessage(pi, HELP_TEXT, { help: true });
          return;
        }

        const vaultPath = parsed.options.vault as string | undefined;
        const runtime = resolveRuntime(ctx.cwd, vaultPath);

        if (subcommand === "vault") {
          const payload = {
            root: runtime.vault.root,
            cache: runtime.cachePath,
            structure: runtime.vault.structure,
            stats: runtime.vault.stats,
          };
          emitCliMessage(pi, formatOutput(parsed.options, payload, formatVaultText(payload)), payload);
          return;
        }

        if (subcommand === "search") {
          const query = parsed.positional.join(" ");
          const searchInput: MemoriaSearchInput = {
            query,
            limit: parseNumericOption(parsed.options.limit),
            snippetLines: parseNumericOption(parsed.options.snippetLines),
            showScore: parsed.options.score === true,
            showLinks: parsed.options.links === true,
            folder: parsed.options.folder as string | undefined,
          };

          const results = runSearch(runtime, searchInput);
          const payload = {
            vault: runtime.vault.root,
            cache: runtime.cachePath,
            query,
            results,
          };

          emitCliMessage(
            pi,
            formatOutput(
              parsed.options,
              payload,
              formatSearchText(results, {
                showScore: searchInput.showScore,
                showLinks: searchInput.showLinks,
              }),
            ),
            payload,
          );
          return;
        }

        if (subcommand === "read") {
          const file = parsed.positional[0] || "";
          const result = runRead(runtime, file);
          const payload = {
            vault: runtime.vault.root,
            cache: runtime.cachePath,
            file: result.file,
            content: result.content,
          };
          emitCliMessage(pi, formatOutput(parsed.options, payload, result.content), payload);
          return;
        }

        if (subcommand === "index") {
          if (!parsed.options.rebuild) {
            emitCliMessage(pi, "Use --rebuild to force cache rebuild.", {
              vault: runtime.vault.root,
              cache: runtime.cachePath,
              rebuilt: false,
            });
            return;
          }

          const result = runIndex(runtime, true);
          const message = result.removed
            ? "Cache invalidated. Next search will rebuild index."
            : "No cache file found. Next search will build index.";

          const payload = {
            vault: runtime.vault.root,
            cache: runtime.cachePath,
            rebuilt: true,
            removed: result.removed,
            fingerprint: result.fingerprint,
          };

          emitCliMessage(pi, formatOutput(parsed.options, payload, `${message}\nFingerprint: ${result.fingerprint}`), payload);
          return;
        }

        emitCliMessage(pi, HELP_TEXT, { help: true, unknownCommand: subcommand });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (ctx.hasUI) {
          ctx.ui.notify(message, "error");
        }
        emitCliMessage(pi, `Error: ${message}`, { error: message });
      }
    },
  });
}

function emitCliMessage(pi: ExtensionAPI, content: string, details: Record<string, unknown>) {
  pi.sendMessage({
    customType: "memoria",
    content,
    display: true,
    details,
  });
}

function parseCliArgs(rawArgs: string): {
  command: string;
  positional: string[];
  options: ParsedOptions;
} {
  const tokens = tokenize(rawArgs);
  const command = tokens[0] || "";
  const positional: string[] = [];
  const options: ParsedOptions = {};

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.startsWith("--")) {
      const key = token.slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      if (tokens[i + 1] && !tokens[i + 1].startsWith("-")) {
        options[key] = tokens[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    } else if (token.startsWith("-")) {
      const key = token.slice(1);
      if (key === "j") options.json = true;
      else if (key === "h") options.help = true;
      else options[key] = true;
    } else {
      positional.push(token);
    }

    i++;
  }

  return { command, positional, options };
}

function tokenize(input: string): string[] {
  if (!input.trim()) return [];

  const matches = input.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return matches.map(stripWrappingQuotes);
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseNumericOption(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
}

function formatOutput(options: ParsedOptions, payload: unknown, plainText: string): string {
  if (options.json === true) return formatJson(payload);
  return plainText;
}

function formatVaultText(payload: {
  root: string;
  cache: string;
  stats: { totalFiles: number; totalSize: number };
  structure: { dateFormat?: string; roundPattern?: string; folders: string[] };
}): string {
  const lines = [
    `root: ${payload.root}`,
    `cache: ${payload.cache}`,
    `files: ${payload.stats.totalFiles}`,
    `size: ${payload.stats.totalSize}`,
  ];

  if (payload.structure.dateFormat) lines.push(`date format: ${payload.structure.dateFormat}`);
  if (payload.structure.roundPattern) lines.push(`round pattern: ${payload.structure.roundPattern}`);
  if (payload.structure.folders.length > 0) lines.push(`folders: ${payload.structure.folders.length}`);

  return lines.join("\n");
}

function formatSearchText(
  results: SearchResult[],
  options: { showScore?: boolean; showLinks?: boolean },
): string {
  if (results.length === 0) return "No results found.";

  const lines: string[] = [];

  for (const result of results) {
    const parts = [result.file];
    if (options.showScore) parts.push(`score: ${result.score}`);
    if (options.showLinks) parts.push(`links: ${result.links}`);
    parts.push(`(${result.modified})`);
    lines.push(parts.join(" "));

    for (const snippet of result.snippets) {
      lines.push(`  ${snippet.line}: ${snippet.text}`);
    }
  }

  lines.push("");
  lines.push("HINT: Use /memoria read <file> to read a file.");

  return lines.join("\n");
}

function appendTruncationMessage(result: {
  content: string;
  truncated: boolean;
  outputLines: number;
  totalLines: number;
  outputBytes: number;
  totalBytes: number;
}): string {
  if (!result.truncated) return result.content;

  const suffix = `\n\n[Output truncated: ${result.outputLines}/${result.totalLines} lines, ${result.outputBytes}/${result.totalBytes} bytes]`;
  return `${result.content}${suffix}`;
}
