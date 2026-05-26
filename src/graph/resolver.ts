import fs from 'fs';
import path from 'path';
import type { ImportFact } from '../types.js';

/**
 * Resolves module specifiers to absolute file paths.
 * Handles: relative imports (./foo, ../bar), extensionless imports, index files.
 */
export class ImportResolver {
  private projectPath: string;
  private extensions = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx'];

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  resolve(specifier: string, fromFile: string): string | null {
    if (!specifier.startsWith('.')) {
      // Bare specifier (e.g. 'lodash', 'react') — external, skip
      return null;
    }

    const baseDir = path.dirname(fromFile);
    const resolved = path.resolve(baseDir, specifier);

    // Try exact match
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return path.normalize(resolved);
    }

    // Try appending extensions
    for (const ext of this.extensions) {
      const withExt = resolved + ext;
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
        return path.normalize(withExt);
      }
    }

    // Try index files
    for (const ext of this.extensions) {
      const indexFile = path.join(resolved, 'index' + ext);
      if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
        return path.normalize(indexFile);
      }
    }

    return null;
  }

  toProjectRelative(absPath: string): string {
    return path.relative(this.projectPath, absPath).replace(/\\/g, '/');
  }
}

/**
 * Symbol table for cross-file name resolution.
 * Maps symbol names to their declaration nodes across the project.
 */
export class SymbolTable {
  // symbolName → [{ language, filePath, nodeId, isExported }]
  private symbols = new Map<string, Array<{
    language: string;
    filePath: string;
    nodeId: string;
    isExported: boolean;
  }>>();

  // filePath → [{ localName, sourceFile, exportedName }]
  private imports = new Map<string, Array<{
    localName: string;
    sourceFile: string;
    exportedName: string;
  }>>();

  register(language: string, filePath: string, name: string, nodeId: string, isExported: boolean): void {
    const key = name;
    if (!this.symbols.has(key)) {
      this.symbols.set(key, []);
    }
    this.symbols.get(key)!.push({ language, filePath, nodeId, isExported });
  }

  registerImport(filePath: string, fact: ImportFact, resolvedFile: string | null): void {
    if (!resolvedFile) return;
    for (const importedName of fact.importedNames) {
      const localName = importedName === 'default' ? null : importedName;
      if (localName) {
        if (!this.imports.has(filePath)) {
          this.imports.set(filePath, []);
        }
        this.imports.get(filePath)!.push({
          localName,
          sourceFile: resolvedFile,
          exportedName: importedName,
        });
      }
    }
  }

  /**
   * Resolve a callee name to a node ID, given the caller's file.
   * Returns null if unresolvable.
   */
  resolve(language: string, callerFile: string, calleeName: string): string | null {
    // 1. Check if callee is an imported symbol
    const fileImports = this.imports.get(callerFile) || [];
    const imp = fileImports.find(i => i.localName === calleeName);
    if (imp) {
      // Find the exported symbol in the source file
      const candidates = this.symbols.get(imp.exportedName) || [];
      const match = candidates.find(c =>
        c.filePath === imp.sourceFile && c.isExported
      );
      if (match) return match.nodeId;
    }

    // 2. Check same-file declarations
    const sameFile = (this.symbols.get(calleeName) || [])
      .filter(s => s.filePath === callerFile);
    if (sameFile.length > 0) {
      return sameFile[0].nodeId;
    }

    // 3. Check any exported declaration across the project
    const exported = (this.symbols.get(calleeName) || [])
      .filter(s => s.isExported);
    if (exported.length > 0) {
      return exported[0].nodeId;
    }

    return null;
  }

  /**
   * Find a method node: className:methodName
   */
  resolveMethod(language: string, callerFile: string, className: string, methodName: string): string | null {
    // Try in the same file first
    const candidates = (this.symbols.get(`${className}:${methodName}`) || [])
      .filter(s => s.filePath === callerFile);
    if (candidates.length > 0) return candidates[0].nodeId;

    // Try project-wide
    const allCandidates = this.symbols.get(`${className}:${methodName}`) || [];
    if (allCandidates.length > 0) return allCandidates[0].nodeId;

    return null;
  }
}
