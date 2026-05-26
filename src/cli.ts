#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { runPipeline, exportJson, generateHtmlOutput, getStats } from './pipeline.js';

const program = new Command();

program
  .name('crg')
  .description('Code Relation Graph — multi-language code graph navigator')
  .version('0.1.0');

program
  .command('build')
  .description('Parse project and generate HTML + JSON output')
  .argument('<project-path>', 'Path to project root')
  .option('-l, --languages <langs>', 'Comma-separated language list (ts,py,go)', 'ts')
  .option('-e, --exclude <patterns>', 'Comma-separated exclude globs', '**/*.test.*,**/*.spec.*,**/*.d.ts,node_modules/**')
  .option('-i, --include <patterns>', 'Comma-separated include-only roots (e.g. src/**)')
  .option('--html <path>', 'Output path for HTML (default: codegraph/graph.html in project)')
  .option('--json <path>', 'Output path for JSON (default: codegraph/graph.json in project)')
  .action((projectPath: string, options: { languages: string; exclude: string; include?: string; html?: string; json?: string }) => {
    const start = Date.now();
    const resolved = path.resolve(projectPath);

    // Parse
    console.error(`Parsing ${resolved}...`);
    const parseResult = runPipeline({
      projectPath: resolved,
      languages: options.languages.split(',').map(s => s.trim()),
      excludePatterns: options.exclude.split(',').map(s => s.trim()),
      includePatterns: options.include?.split(',').map(s => s.trim()),
    });

    // HTML
    const htmlPath = options.html || path.join(resolved, './codegraph/graph.html');
    generateHtmlOutput(resolved, htmlPath);

    // JSON
    const jsonPath = options.json || path.join(resolved, './codegraph/graph.json');
    exportJson(resolved, jsonPath);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`\nDone in ${elapsed}s`);
    console.log(JSON.stringify(parseResult.stats, null, 2));
  });

program
  .command('parse')
  .description('Parse source files and build graph database')
  .argument('<project-path>', 'Path to project root')
  .option('-l, --languages <langs>', 'Comma-separated language list (ts,py,go)', 'ts')
  .option('-e, --exclude <patterns>', 'Comma-separated exclude globs', '**/*.test.*,**/*.spec.*,**/*.d.ts,node_modules/**')
  .option('-i, --include <patterns>', 'Comma-separated include-only roots (e.g. src/**)')
  .action((projectPath: string, options: { languages: string; exclude: string; include?: string }) => {
    const start = Date.now();
    console.error(`Parsing ${projectPath}...`);

    const result = runPipeline({
      projectPath: path.resolve(projectPath),
      languages: options.languages.split(',').map(s => s.trim()),
      excludePatterns: options.exclude.split(',').map(s => s.trim()),
      includePatterns: options.include?.split(',').map(s => s.trim()),
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`Done in ${elapsed}s`);
    console.log(JSON.stringify(result.stats, null, 2));
  });

program
  .command('export')
  .description('Export graph to JSON')
  .argument('<project-path>', 'Path to project root')
  .option('-o, --output <path>', 'Output file path')
  .action((projectPath: string, options: { output?: string }) => {
    try {
      const json = exportJson(path.resolve(projectPath), options.output);
      if (!options.output) process.stdout.write(json);
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('html')
  .description('Generate static HTML visualization with vis-network')
  .argument('<project-path>', 'Path to project root')
  .option('-o, --output <path>', 'Output HTML file path')
  .action((projectPath: string, options: { output?: string }) => {
    try {
      const outPath = generateHtmlOutput(path.resolve(projectPath), options.output);
      console.log(outPath);
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show graph statistics')
  .argument('<project-path>', 'Path to project root')
  .action((projectPath: string) => {
    try {
      const stats = getStats(path.resolve(projectPath));
      console.log(JSON.stringify(stats, null, 2));
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse(process.argv);
