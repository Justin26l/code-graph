# code-relation-graph

Multi-language code relation graph navigator for humans and AI agents. Parses source code into a hierarchical property graph (feature/module → file → class → function) with resolved cross-file call edges.

## Quick start

```bash
# Install
npm install -g .
# or run directly:
node dist/cli.js --help

# Parse a TypeScript project
crg parse ./my-project --languages ts

# Generate interactive HTML visualization
crg html ./my-project -o graph.html
# Open graph.html in any browser

# Export to JSON (for AI agents / programmatic use)
crg export ./my-project -o graph.json

# Show graph statistics
crg stats ./my-project
```

## Commands

| Command | Description |
|---------|-------------|
| `crg parse <path>` | Parse source files, build graph database (.crg/code-graph.db) |
| `crg html <path>` | Generate self-contained HTML with vis-network visualization |
| `crg export <path>` | Export graph as JSON |
| `crg stats <path>` | Show node/edge counts by type |

### Options

- `--languages ts,py,go` — comma-separated language list (currently TS only, Python/Go stubs exist)
- `--exclude "**/*.test.*,node_modules/**"` — exclude patterns
- `--include "src/**"` — restrict to specific directories
- `-o, --output <path>` — output file path

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│ Source Files │───▶│ tree-sitter  │───▶│ Graph       │───▶│ SQLite DB    │
│ (.ts,.py,.go)│    │ Fact Extract │    │ Builder     │    │ (nodes+edges)│
└─────────────┘    └──────────────┘    └─────────────┘    └──────┬───────┘
                                                                 │
                                                     ┌───────────┼───────────┐
                                                     │           │           │
                                                     ▼           ▼           ▼
                                               JSON Export  graph.html  Query CLI
                                               (graph.json) (vis-network)(--callers-of etc.)
```

### Layer 1: tree-sitter fact extraction

A **LanguageAdapter** interface — each language implements queries for functions, calls, classes, imports, exports. Currently:
- **TypeScript/JavaScript** — tree-sitter-typescript grammar (handles `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`)
- Python and Go adapters are planned (tree-sitter grammars installed)

Facts are structural only — no cross-file decisions at this layer.

### Layer 2: cross-file resolution

Two-pass pipeline:
1. **Pass 1** — parse all files, register declarations and imports in a `SymbolTable`
2. **Pass 2** — resolve CALLEES via import chains, resolve IMPORTS to actual file paths

Unresolved calls (external libraries, dynamic) are kept as edges to unknown targets with full call-site metadata.

### Layer 3: storage & visualization

- **SQLite** via better-sqlite3 — embedded, zero-config, file-based cache at `.crg/code-graph.db`
- **JSON export** — flat nodes/edges format for AI agents and programmatic consumption
- **HTML** — self-contained file with vis-network via CDN. No server, no build step, opens in any browser

## Graph schema

### Node types

| Type | Description | Visual |
|------|-------------|--------|
| `directory` | Source directory | Blue box |
| `file` | Source file | Green ellipse |
| `class` | Class declaration | Salmon dot |
| `function` | Function/method declaration | Sky blue dot |
| `method` | Class method declaration | Green dot |

### Edge types

| Type | Description |
|------|-------------|
| `CONTAINS` | Directory → file, file → function, class → method |
| `CALLS` | Function → function (resolved cross-file where possible) |
| `IMPORTS` | File → file (resolved to actual source files) |
| `EXPORTS` | File → exported symbol |

### Stable ID scheme

```
<language>:<relativeFilePath>:<symbolName>
```

Example: `ts:src/auth/login.ts:AuthService:authenticate`

## HTML visualization

The generated HTML includes:
- **Hierarchical** layout (default) — directories at top, files below, functions/classes at bottom
- **Force-directed** layout — physics-based, switchable via dropdown
- **Search** — filter nodes by name in real-time
- **Type filter** — show/hide specific node types
- **Edge toggles** — show/hide CONTAINS, CALLS, IMPORTS independently
- **Focus mode** — click a node to dim everything except its direct neighbors (double-click to restore)
- **Node inspection** — click any node to see its file, line range, and type in the status bar
- **Tooltips** — hover edges to see call type, hover nodes for metadata

## Example output

```
Parsing my-project...
Found 26 source files
Parsed 26 files
  Wrote 69 nodes, 396 edges in 16ms
Done in 1.1s
{
  "nodeCount": 69,
  "edgeCount": 396,
  "nodesByType": {
    "class": 1, "directory": 10, "file": 26,
    "function": 31, "method": 1
  },
  "edgesByType": {
    "CALLS": 177, "CONTAINS": 69,
    "EXPORTS": 21, "IMPORTS": 80
  },
  "filesParsed": 26,
  "languages": ["ts"]
}
```

Cross-file call resolution example:
```
article.controller.ts:(top-level) -> article.service.ts:getArticles
auth.controller.ts:(top-level)     -> auth.service.ts:login
article.service.ts:getArticles     -> article.service.ts:buildFindAllQuery
```

## Current status

- ✅ TypeScript/JavaScript support (functions, calls, classes, imports, exports)
- ✅ Cross-file call resolution via import chains
- ✅ Cross-file import resolution (file-to-file edges)
- ✅ SQLite graph cache
- ✅ JSON export
- ✅ Self-contained HTML visualization with vis-network
- ✅ Focus mode, search, filtering
- ⏳ Python adapter (tree-sitter grammar installed, adapter not yet written)
- ⏳ Go adapter (tree-sitter grammar installed, adapter not yet written)
- ⏳ More edge types (INSTANTIATES, IMPLEMENTS, OVERRIDES, REFERENCES)
- ⏳ Incremental parsing
- ⏳ MCP server mode for AI agent consumption

## Project structure

```
src/
├── cli.ts                    # CLI entry point (commander)
├── pipeline.ts               # Orchestrates: parse → build → store → export
├── types.ts                  # Shared type definitions
├── parser/
│   ├── index.ts              # Parser factory
│   ├── adapter.ts            # LanguageAdapter interface
│   ├── tree-sitter-setup.ts  # Grammar loading
│   └── adapters/
│       └── typescript.ts     # TS/JS adapter
├── graph/
│   ├── builder.ts            # Facts → property graph
│   ├── resolver.ts           # Cross-file import & call resolution
│   ├── schema.ts             # SQLite DDL
│   ├── store.ts              # better-sqlite3 CRUD
│   ├── query.ts              # Query methods (callersOf, calleesOf, search)
│   └── export.ts             # JSON serializer
└── html/
    └── generate.ts           # Self-contained HTML with vis-network
```
