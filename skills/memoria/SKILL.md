---
name: memoria
description: BM25 search for Obsidian vaults using extension tools. Use when the task may need the user's notes, past research, memory, or personal docs.
license: MIT
---

# memoria

Use this skill with the `memoria_*` extension tools.

## Goal

Find and read relevant Obsidian notes fast, from any working directory.

Cache is created in the current execution directory at `.memoria/`.

## Tool flow

1. Use `memoria_search` first.
2. Open best matches with `memoria_read`.
3. If vault path is unclear, call `memoria_vault`.
4. If results seem stale, call `memoria_index` with `rebuild=true`.

## Tool usage

### memoria_search

Required:
- `query`

Optional:
- `vault` (vault root or subpath)
- `limit`
- `snippet_lines`
- `folder`
- `score`
- `links`
- `rebuild`

### memoria_read

Required:
- `file`

Optional:
- `vault`

### memoria_vault

Optional:
- `vault`

### memoria_index

Optional:
- `vault`
- `rebuild`

## Slash command CLI

You can also run:

- `/memoria vault`
- `/memoria search "query"`
- `/memoria read "file"`
- `/memoria index --rebuild`

Use `--vault <path>` when working outside the vault tree.
