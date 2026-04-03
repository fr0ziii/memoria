---
name: memoria
description: BM25 search for Obsidian vaults. Searches markdown notes with recency boosting and backlink awareness. Use when answering questions, helping the user with any topic, or whenever the user's personal knowledge, notes, past conversations, research, or stored information could be relevant.
license: MIT
---

# memoria

BM25 search system for Obsidian vaults. Searches markdown notes with recency boosting and backlink awareness.

## Installation

For CLI usage:
```bash
npm install -g git:github.com/fr0ziii/memoria
```

## How to invoke

```bash
memoria <command>
```

For example:

```bash
cd <skill-directory> && bun run src/index.ts search "query"
cd <skill-directory> && bun run src/index.ts read "filename"
cd <skill-directory> && bun run src/index.ts vault
```

**Important:** Always `cd` to the skill directory first before running commands.

## Quick Start

```bash
# 1. Search for relevant notes
cd <skill-directory> && bun run src/index.ts search "authentication"

# 2. Read the most relevant file
cd <skill-directory> && bun run src/index.ts read "Architecture"

# 3. Check vault info
cd <skill-directory> && bun run src/index.ts vault
```

## Tool Definitions

### memoria_search

Searches relevant notes in the vault using BM25.

```json
{
  "name": "memoria_search",
  "description": "Searches Obsidian vault notes by keywords. Returns relevant files ranked by relevance + recency.",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search terms"
      },
      "limit": {
        "type": "number",
        "description": "Max results (default: 10)"
      },
      "snippet_lines": {
        "type": "number",
        "description": "Context lines around matches (default: 0)"
      }
    },
    "required": ["query"]
  }
}
```

**Usage:**
1. Invoke with `cd <skill-directory> && bun run src/index.ts search "query"`
2. Review results and filenames
3. Invoke `memoria_read` on the most relevant files

### memoria_read

Reads full content of a note.

```json
{
  "name": "memoria_read",
  "description": "Reads the full content of a vault note.",
  "parameters": {
    "type": "object",
    "properties": {
      "file": {
        "type": "string",
        "description": "Filename or relative path (e.g. '2024-01-15/round-1')"
      }
    },
    "required": ["file"]
  }
}
```

**Usage:**
1. Use the filename or path returned by `memoria_search`
2. Invoke with `cd <skill-directory> && bun run src/index.ts read "filename"`

### memoria_vault

Shows vault info: detected structure, stats, location.

```json
{
  "name": "memoria_vault",
  "description": "Shows current vault info: path, detected structure, statistics.",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
```

**Usage:**
Invoke with `cd <skill-directory> && bun run src/index.ts vault`

### memoria_index

Search index management.

```json
{
  "name": "memoria_index",
  "description": "Rebuilds the search index. Useful when results are inaccurate.",
  "parameters": {
    "type": "object",
    "properties": {
      "rebuild": {
        "type": "boolean",
        "description": "Force index rebuild"
      }
    }
  }
}
```

**Usage:**
Invoke with `cd <skill-directory> && bun run src/index.ts index --rebuild`

## Workflow

```
1. cd <skill-directory> && bun run src/index.ts search "query"     → find relevant files
2. cd <skill-directory> && bun run src/index.ts read "<file>"      → read full content
3. repeat as needed
```

## Auto-detected Structures

memoria automatically detects:

| Structure | Detects |
|-----------|---------|
| Date folders | `YYYY-MM-DD/` directories |
| Round notes | `round-N.md` pattern |
| Wikilinks | `[[link]]` for backlinks |
| Frontmatter | YAML properties |
| Tags | `#tag` syntax |

## Options

| Flag | Description |
|------|-------------|
| `--json` | JSON output (for parsing) |
| `--score` | Show relevance score |
| `--links` | Show backlink counts |
| `--folder <path>` | Limit search to folder |

## Scoring

Results are ranked by:

```
score = BM25 + backlinks * 0.5 + recency
```

- **BM25**: Text relevance
- **backlinks**: Files linking to this (0.5x boost)
- **recency**: More recent notes get additional boost

## Hints

- By default, no snippets are shown — use `--snippet-lines 2` if you need context
- Scores are hidden by default — use `--score` only for debugging
- If results are poor, run `cd <skill-directory> && bun run src/index.ts index --rebuild`
