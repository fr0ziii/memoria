#!/usr/bin/env node

import { bold, dim, formatJson, formatVaultInfo } from "./output.js";
import { resolveRuntime, runIndex, runRead, runSearch } from "./runtime.js";

function parseArgs(args: string[]): {
  command: string;
  options: Record<string, string | boolean>;
  positional: string[];
} {
  let command = "";
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "search" || arg === "read" || arg === "vault" || arg === "index" || arg === "--help" || arg === "-h") {
      if (!command) {
        command = arg;
      }
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (args[i + 1] && !args[i + 1].startsWith("-")) {
        options[key] = args[i + 1];
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      if (key === "j") options["json"] = true;
      else if (key === "h") options["help"] = true;
      else options[key] = true;
    } else {
      positional.push(arg);
    }
    i++;
  }

  return { command, options, positional };
}

function help() {
  console.log(`
${bold("memoria")} - BM25 search for Obsidian vaults

${bold("Commands:")}

  memoria vault                    Show vault info
  memoria search <query>           Search notes
  memoria read <file>              Read file contents
  memoria index --rebuild          Rebuild search cache

${bold("Options:")}

  --vault <path>                   Vault root or path inside vault
  --json                           JSON output
  --limit <n>                      Max results (default: 10)
  --snippet-lines <n>              Context lines (default: 0)
  --score                          Show relevance score
  --links                          Show backlink counts
  --folder <path>                  Limit to folder
  --rebuild                        Force cache rebuild
  -h, --help                       Show this help
  `);
}

function parseNumber(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

export async function main() {
  const args = process.argv.slice(2);
  const { command, options, positional } = parseArgs(args);

  if (command === "--help" || command === "-h" || command === "help") {
    help();
    return;
  }

  if (!command && positional.length === 0 && Object.keys(options).length === 0) {
    help();
    return;
  }

  if (!command) {
    help();
    process.exit(1);
  }

  const runtime = resolveRuntime(process.cwd(), options.vault as string | undefined);

  switch (command) {
    case "vault": {
      if (options.json) {
        console.log(formatJson({
          root: runtime.vault.root,
          structure: runtime.vault.structure,
          stats: runtime.vault.stats,
          cache: runtime.cachePath,
        }));
      } else {
        console.log(formatVaultInfo(runtime.vault));
        console.log(`cache: ${runtime.cachePath}`);
      }
      break;
    }

    case "search": {
      const query = positional.join(" ") || (options.query as string) || "";
      const results = runSearch(runtime, {
        query,
        limit: parseNumber(options.limit, 10),
        snippetLines: parseNumber(options.snippetLines, 0),
        showScore: options.score === true,
        showLinks: options.links === true,
        folder: options.folder as string | undefined,
      });

      if (options.json) {
        console.log(formatJson({ results }));
      } else if (results.length === 0) {
        console.log("No results found.");
      } else {
        for (const result of results) {
          const parts = [bold(result.file)];
          if (options.score) parts.push(dim(`score: ${result.score}`));
          if (options.links) parts.push(dim(`links: ${result.links}`));
          parts.push(dim(`(${result.modified})`));
          console.log(parts.join(" "));

          if (result.snippets.length > 0) {
            for (const snippet of result.snippets) {
              console.log(`  ${dim(`${snippet.line}:`)} ${snippet.text}`);
            }
          }
        }
        console.log("");
        console.log(dim("HINT: Use memoria read <file> to read a file."));
      }
      break;
    }

    case "read": {
      const file = positional[0] || (options.file as string);
      const readResult = runRead(runtime, file || "");
      if (options.json) {
        console.log(formatJson(readResult));
      } else {
        console.log(readResult.content);
      }
      break;
    }

    case "index": {
      if (options.rebuild) {
        const result = runIndex(runtime, true);
        if (result.removed) {
          console.log("Cache invalidated. Next search will rebuild index.");
        } else {
          console.log("No cache file found. Next search will build index.");
        }
        console.log(`Fingerprint: ${result.fingerprint}`);
      } else {
        console.log("Use --rebuild to force cache rebuild.");
      }
      break;
    }

    default: {
      help();
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
