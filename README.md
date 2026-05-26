# code-relation-graph

A CLI tool that parses your source code and builds an interactive graph of relations between files, functions, and classes. Helps humans and AI agents understand code structure — what calls what, what imports what, and where things live.

## Quick start

```bash
# Install globally (from this repo)
npm install -g .
# or run directly:
node dist/cli.js --help

# Parse a TypeScript project
codegraph parse ./my-project --languages ts

# Generate interactive HTML visualization
codegraph html ./my-project -o graph.html
# Open graph.html in any browser

# Export graph as JSON (for AI agents / programmatic use)
codegraph export ./my-project -o graph.json

# Show graph statistics
codegraph stats ./my-project
```

## Commands

| Command | Description |
|---------|-------------|
| `parse` | Parse source files and build graph database |
| `html` | Generate interactive HTML visualization |
| `export` | Export graph as JSON |
| `stats` | Show node/edge counts by type |

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--languages` | `ts` | Comma-separated languages (`ts`, `py`, `go`) |
| `--exclude` | `**/*.test.*,node_modules/**` | Exclude patterns |
| `--include` | — | Restrict parsing to specific paths |
| `-o, --output` | — | Output file path |

## What it does

- Parses TypeScript/JavaScript (Python/Go planned) using tree-sitter
- Builds a graph with: files, directories, classes, functions/methods
- Resolves cross-file calls — when `auth.login()` is called in `index.ts`, the edge points to the actual `login` method in `auth.ts`
- Tracks file-to-file imports
- Generates a self-contained HTML file (no server, no build step) with an interactive vis-network visualization

## HTML visualization features

- **Hierarchical layout** (default) — directories at top, files below, functions at bottom
- **Force-directed layout** — switch via dropdown
- **Search** — filter nodes by name in real-time
- **Type filter** — show/hide directories, files, classes, functions
- **Edge toggles** — show/hide CONTAINS, CALLS, IMPORTS edges
- **Focus mode** — click a node to dim everything except its neighbors; double-click to restore
- **Click any node** to see its file path, line range, and type

## Language support

| Language | Status |
|----------|--------|
| TypeScript / JavaScript | ✅ Working |
| Python | ⏳ Grammar installed, adapter not yet written |
| Go | ⏳ Grammar installed, adapter not yet written |

## Example

```bash
# Parse a project
codegraph parse ~/projects/my-app --languages ts --include "src/**"

# Open the visual graph
codegraph html ~/projects/my-app
open graph.html

# Feed the JSON to an AI agent
codegraph export ~/projects/my-app | pbcopy
```
