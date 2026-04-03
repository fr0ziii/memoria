#!/usr/bin/env bun

import { bold, dim, formatJson, formatVaultInfo } from "./output.js";
import { findVault, getCachePath, ensureCacheDir } from "./vault.js";
import { search, readFile, listMarkdownFiles } from "./search.js";
import { formatJson as fj } from "./output.js";

// Colors (basic, no chalk dependency)
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
};

function parseArgs(args: string[]): {
  command: string;
  subcommand?: string;
  options: Record<string, string | boolean>;
  positional: string[];
} {
  let command = "";
  let subcommand = "";
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    if (arg === "search" || arg === "read" || arg === "vault" || arg === "index" || arg === "--help" || arg === "-h") {
      if (!command) {
        command = arg;
      } else if (arg !== "--help" && arg !== "-h") {
        subcommand = arg;
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
      else if (key === "v") options["verbose"] = true;
      else if (key === "h") options["help"] = true;
      else options[key] = true;
    } else {
      positional.push(arg);
    }
    i++;
  }

  return { command, subcommand, options, positional };
}

function help() {
  console.log(`
${bold("memoria")} — BM25 search for Obsidian vaults

${bold("Commands:")}

  memoria vault                    Show vault info
  memoria search <query>           Search notes
  memoria read <file>              Read file contents
  memoria index --rebuild          Rebuild search cache

${bold("Options:")}

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

async function main() {
  const args = process.argv.slice(2);
  const { command, options, positional } = parseArgs(args);

  // Auto-detect vault
  const vault = findVault();
  if (!vault) {
    console.error("Error: Not in an Obsidian vault (no .obsidian folder found)");
    process.exit(1);
  }

  ensureCacheDir(vault.root);

  // Handle commands
  switch (command) {
    case "vault": {
      if (options.json) {
        console.log(formatJson({
          root: vault.root,
          structure: vault.structure,
          stats: vault.stats,
        }));
      } else {
        console.log(formatVaultInfo(vault));
      }
      break;
    }

    case "search": {
      const query = positional.join(" ") || options.query as string || "";
      if (!query) {
        console.error("Error: No query specified");
        process.exit(1);
      }

      const results = search({
        query,
        vaultPath: vault.contentPath,
        cachePath: getCachePath(vault.root),
        limit: options.limit ? parseInt(options.limit as string) : 10,
        snippetLines: options.snippetLines ? parseInt(options.snippetLines as string) : 0,
        showScore: options.score === true,
        showLinks: options.links === true,
        folder: options.folder as string,
        json: options.json === true,
      });

      if (options.json) {
        console.log(formatJson({ results }));
      } else if (results.length === 0) {
        console.log("No results found.");
      } else {
        for (const r of results) {
          const parts = [bold(r.file)];
          if (options.score) parts.push(dim(`score: ${r.score}`));
          if (options.links) parts.push(dim(`links: ${r.links}`));
          parts.push(dim(`(${r.modified})`));
          console.log(parts.join(" "));

          if (r.snippets.length > 0) {
            for (const s of r.snippets) {
              console.log(`  ${dim(`${s.line}:`)} ${s.text}`);
            }
          }
        }
        console.log("");
        console.log(dim("HINT: Use memoria read <file> to read a file."));
      }
      break;
    }

    case "read": {
      const file = positional[0] || options.file as string;
      if (!file) {
        console.error("Error: No file specified");
        process.exit(1);
      }

      // Try exact path first, then search by basename
      let content = readFile(vault.contentPath, file);
      if (!content && !file.endsWith(".md")) {
        content = readFile(vault.contentPath, `${file}.md`);
      }

      if (!content) {
        // Search for file by basename
        const files = listMarkdownFiles(vault.contentPath);
        const match = files.find(
          (f) => f.endsWith(`/${file}.md`) || f.endsWith(`/${file}`)
        );
        if (match) {
          content = fs.readFileSync(match, "utf-8");
        }
      }

      if (!content) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
      }

      console.log(content);
      break;
    }

    case "index": {
      if (options.rebuild) {
        // Force rebuild by computing new fingerprint
        const { computeFingerprint } = await import("./search.js");
        const fingerprint = computeFingerprint(vault.contentPath);
        console.log(`Cache invalidated. Next search will rebuild index.`);
        console.log(`Fingerprint: ${fingerprint}`);
      } else {
        console.log("Use --rebuild to force cache rebuild.");
      }
      break;
    }

    case "--help":
    case "-h":
    case "help":
    default: {
      if (positional.length === 0 && Object.keys(options).length === 0) {
        help();
      } else {
        help();
        process.exit(1);
      }
    }
  }
}

import * as fs from "fs";

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
