# code-relation-graph

## ERD-style code relation graph plan

This project will be built as an **“ERD for code”** with clear, separable stages:

1. **Fact extraction** from AST
2. **Name/type resolution** via TypeScript symbols
3. **Graph modeling + visualization/export**

## MVP scope (first useful version)

Build a **static call graph** at function/method granularity.

### Node model (MVP)

- `FunctionNode`
  - `id` (stable symbol-based id)
  - `name`
  - `filePath`
  - `startLine`, `endLine`
  - `containerName` (class/namespace/module)
  - `kind` (`function | method | arrow | constructor`)
  - `exported`
  - `async`
  - `generator`

### Edge model (MVP)

- `CALLS`
  - `callerId`
  - `calleeId`
  - `callSiteFile`
  - `callSiteLine`
  - `callText`
  - `callKind` (`direct | method | constructor | optionalChain | tagged`)
  - `isAwaited`

## Architecture

### Layer 1: AST fact extractor

Parse source files and collect:

- function/method declarations
- call-like expressions
- import/export declarations
- class/interface declarations

No cross-file name decisions here; only structural facts.

### Layer 2: TypeScript resolver (core accuracy)

Use `ts.createProgram(...)` + `program.getTypeChecker()` (or `ts-morph` wrapper) to resolve symbols:

- For each call expression:
  - `checker.getResolvedSignature(callExpr)`
  - declaration from signature/symbol declarations
- Map callsite facts to concrete declaration ids
- Track unresolved/dynamic calls explicitly as `external/unknown`

### Layer 3: graph builder + exporters

Build a property graph with typed nodes/edges and export to:

- **JSON** (primary, UI-friendly)
- **DOT** (quick sanity-check rendering)

Optional future outputs: Mermaid, Cytoscape.js, GraphML/GEXF, Neo4j import.

## Minimal extractor loop

1. Load `tsconfig.json` and create a Program.
2. Visit each source file (exclude `node_modules`, generated files, tests by default).
3. Register declaration nodes with stable ids.
4. Find call/new/tagged expressions and resolve targets with TypeChecker.
5. Emit typed edges with callsite metadata.
6. Write `graph.json` and `graph.dot`.

## Relationship types roadmap

### Phase 1 (MVP)

- `CALLS`
- `DECLARES` (file -> function/class)
- `IMPORTS` (file -> file/module)

### Phase 2

- `INSTANTIATES`
- `IMPLEMENTS`
- `OVERRIDES`
- `PASSES_CALLBACK_TO`
- `REGISTERS_HANDLER`

### Phase 3 (advanced)

- polymorphic “possible targets” edges
- callback flow enrichment
- SCC cycle detection
- entrypoint/depth slicing
- external library collapsing

## De-noising and slicing controls (required early)

- exclude globs (`node_modules/**`, `**/*.test.*`, generated folders)
- include-only roots (`src/**`)
- exported-only view
- depth-limited traversal from entrypoints
- group-by file/module/class
- treat selected dependencies as external collapsed nodes

## Runtime call stack extension (hybrid mode)

If runtime “did-call” traces are needed:

- instrument Node runtime
- map stack frames via source maps
- emit dynamic edges alongside static edges with scenario metadata

Static graph answers **possible calls**; runtime traces answer **actual calls**.

## Recommended defaults (until clarified)

- Target runtime: **Node.js**
- Graph type first: **static can-call**
- Node granularity: **function/method** with optional file/module grouping

## Open decisions to finalize

1. Target environment: Node, browser, or both?
2. Static only, dynamic only, or hybrid?
3. Primary visualization target: CLI artifacts only or interactive UI?
