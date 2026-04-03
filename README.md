# memoria

BM25 search for Obsidian vaults. Built for Pi as one package with:

- extension tools (`memoria_search`, `memoria_read`, `memoria_vault`, `memoria_index`)
- skill (`memoria`)
- slash command CLI (`/memoria ...`)

No embeddings. No graph DB. Full-text search with recency + backlinks.

## Install

```bash
# Global
pi install git:github.com/fr0ziii/memoria

# Project-local
pi install -l git:github.com/fr0ziii/memoria

# Pinned release (recommended for teams)
pi install git:github.com/fr0ziii/memoria@v0.3.0
```

Verify install:

```bash
pi list
```

## Runtime behavior

Cache follows execution directory.

If Pi runs in `/work/project-a`, memoria cache is created there:

```txt
/work/project-a/.memoria/
```

Each vault gets its own namespaced cache folder inside `.memoria`.

## Extension tools

- `memoria_search`
- `memoria_read`
- `memoria_vault`
- `memoria_index`

These are used by the skill automatically.

## Slash command CLI

```bash
/memoria vault
/memoria search "authentication"
/memoria read "Architecture"
/memoria index --rebuild
```

Use `--vault <path>` when your cwd is not inside the target vault.

## Standalone binary (optional)

This package still ships the `memoria` binary:

```bash
memoria vault
memoria search "query"
memoria read "file"
memoria index --rebuild
```

## Troubleshooting

If you installed an old branch before this refactor:

```bash
pi remove git:github.com/fr0ziii/memoria
pi install git:github.com/fr0ziii/memoria
```

For project-local installs:

```bash
pi remove -l git:github.com/fr0ziii/memoria
pi install -l git:github.com/fr0ziii/memoria
```

## Development

```bash
bun install
bun run build
bun run test
```

## License

MIT
