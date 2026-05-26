import Parser from 'tree-sitter';
import fs from 'fs';
import path from 'path';

import { createParser, detectLanguage, fileExtensionsFor } from './parser/tree-sitter-setup.js';
import { getAdapter, parseFile } from './parser/index.js';
import { GraphBuilder } from './graph/builder.js';
import { GraphStore } from './graph/store.js';
import { GraphQuery } from './graph/query.js';
import { ImportResolver, SymbolTable } from './graph/resolver.js';
import type { ParseOptions, StatsResult, FunctionFact, CallFact, ClassFact, ImportFact, ExportFact } from './types.js';
import { toJson } from './graph/export.js';
import { generateHtml } from './html/generate.js';

interface FileFacts {
  filePath: string;
  language: string;
  functions: FunctionFact[];
  calls: CallFact[];
  classes: ClassFact[];
  imports: ImportFact[];
  exports: ExportFact[];
}

export function runPipeline(options: ParseOptions): {
  store: GraphStore;
  query: GraphQuery;
  stats: StatsResult;
} {
  const { projectPath, languages, excludePatterns, includePatterns } = options;
  const extSet = new Set(fileExtensionsFor(languages));
  const excludeGlobs = excludePatterns.map(p => new RegExp(
    p.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
  ));

  // Collect source files
  const files = findSourceFiles(projectPath, extSet, excludeGlobs, includePatterns);
  console.error(`Found ${files.length} source files`);

  // Set up parser
  const parser = createParser(languages);
  const builder = new GraphBuilder(projectPath);
  const importResolver = new ImportResolver(projectPath);
  const symbolTable = new SymbolTable();

  // ── Pass 1: Parse all files, register declarations ──
  const allFacts: FileFacts[] = [];
  let parsedCount = 0;

  for (const filePath of files) {
    const lang = detectLanguage(filePath);
    if (!lang || !languages.includes(lang)) continue;

    const adapter = getAdapter(lang);
    if (!adapter) {
      console.error(`  Skipping ${filePath}: no adapter for ${lang}`);
      continue;
    }

    const source = fs.readFileSync(filePath, 'utf-8');
    const facts = parseFile(parser, adapter, source, filePath);

    allFacts.push({ filePath, language: lang, ...facts });

    // Register file node
    builder.addFileNode(filePath, lang);

    // Register functions in symbol table
    for (const fn of facts.functions) {
      const node = builder.addFunction(fn, lang);
      symbolTable.register(lang, filePath, fn.name, node.id, fn.exported);
      if (fn.containerName) {
        symbolTable.register(lang, filePath, `${fn.containerName}:${fn.name}`, node.id, fn.exported);
      }
    }

    // Register classes (their methods are created as nodes in addClass, but we need to expose them)
    // We do this from the function facts so they're already registered above
    for (const cls of facts.classes) {
      const { classNode } = builder.addClass(cls, lang);
      symbolTable.register(lang, filePath, cls.name, classNode.id, cls.exported);
    }

    // Register import symbols
    for (const imp of facts.imports) {
      const resolvedFile = importResolver.resolve(imp.moduleSpecifier, filePath);
      symbolTable.registerImport(filePath, imp, resolvedFile);
    }

    parsedCount++;
    if (parsedCount % 50 === 0) {
      console.error(`  Parsed ${parsedCount}/${files.length} files...`);
    }
  }

  console.error(`Parsed ${parsedCount} files`);

  // ── Pass 2: Create edges with resolution ──
  for (const fileFacts of allFacts) {
    const { filePath, language, calls, imports, exports } = fileFacts;

    // Resolve calls
    for (const call of calls) {
      const resolvedId = symbolTable.resolve(language, filePath, call.calleeName);
      builder.addCall(call, language, resolvedId ?? undefined);
    }

    // Resolve imports
    for (const imp of imports) {
      const resolvedFile = importResolver.resolve(imp.moduleSpecifier, filePath);
      // Ensure the resolved file node exists
      if (resolvedFile) {
        const lang = detectLanguage(resolvedFile);
        if (lang) builder.addFileNode(resolvedFile, lang);
      }
      builder.addImport(imp, language, resolvedFile ?? undefined);
    }

    // Exports
    for (const exp of exports) {
      builder.addExport(exp, language);
    }
  }

  // Build directory hierarchy
  builder.buildDirectoryHierarchy();

  // Save to SQLite
  const dbPath = path.join(projectPath, 'codegraph', 'graph.db');
  const store = GraphStore.create(dbPath);
  builder.save(store);

  // Record parsed files
  for (const filePath of files) {
    const lang = detectLanguage(filePath);
    if (lang && languages.includes(lang)) {
      const stat = fs.statSync(filePath);
      store.recordFile(path.relative(projectPath, filePath), lang, stat.size);
    }
  }

  const query = new GraphQuery(store);
  const stats = store.getStats();

  return { store, query, stats };
}

export function exportJson(projectPath: string, outputPath?: string): string {
  const dbPath = path.join(projectPath, 'codegraph', 'graph.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`No graph database found at ${dbPath}. Run 'crg parse' first.`);
  }

  const store = GraphStore.open(dbPath);
  const query = new GraphQuery(store);
  const data = query.toGraphData();
  const json = toJson(data);
  store.close();


  const outPath = outputPath || path.join(projectPath, 'graph.json');
  const outDir = path.dirname(outPath);
  
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, json, 'utf-8');
  console.error(`Exported to ${outPath}`);

  return json;
}

export function generateHtmlOutput(projectPath: string, outputPath?: string): string {
  const dbPath = path.join(projectPath, 'codegraph', 'graph.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`No graph database found at ${dbPath}. Run 'crg parse' first.`);
  }

  const store = GraphStore.open(dbPath);
  const query = new GraphQuery(store);
  const data = query.toGraphData();
  const html = generateHtml(data.nodes, data.edges);
  store.close();

  
  const outPath = outputPath || path.join(projectPath, 'graph.html');
  const outDir = path.dirname(outPath);
  
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, html, 'utf-8');

  console.error(`HTML generated at ${outPath}`);
  return outPath;
}

export function getStats(projectPath: string): StatsResult {
  const dbPath = path.join(projectPath, 'codegraph', 'graph.db');
  if (!fs.existsSync(dbPath)) {
    throw new Error(`No graph database found at ${dbPath}. Run 'crg parse' first.`);
  }

  const store = GraphStore.open(dbPath);
  const stats = store.getStats();
  store.close();
  return stats;
}

// ── File discovery ──

function findSourceFiles(
  rootPath: string,
  extensions: Set<string>,
  excludePatterns: RegExp[],
  includePatterns?: string[]
): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip hidden dirs, node_modules, etc.
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(fullPath);
        if (!extensions.has(ext)) continue;

        const relPath = path.relative(rootPath, fullPath);
        if (excludePatterns.some(p => p.test(relPath))) continue;
        if (includePatterns && !includePatterns.some(p => relPath.startsWith(p))) continue;

        files.push(fullPath);
      }
    }
  }

  walk(rootPath);
  return files;
}
