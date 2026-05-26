import Parser from 'tree-sitter';
import type { LanguageAdapter } from './adapter.js';
import { typeScriptAdapter } from './adapters/typescript.js';

const adapterRegistry = new Map<string, LanguageAdapter>();

// Register built-in adapters
adapterRegistry.set('ts', typeScriptAdapter);
adapterRegistry.set('js', typeScriptAdapter);
adapterRegistry.set('tsx', typeScriptAdapter);

export function getAdapter(language: string): LanguageAdapter | undefined {
  return adapterRegistry.get(language);
}

export function parseFile(
  parser: Parser,
  adapter: LanguageAdapter,
  source: string,
  filePath: string
): {
  functions: ReturnType<LanguageAdapter['extractFunctions']>;
  calls: ReturnType<LanguageAdapter['extractCalls']>;
  classes: ReturnType<LanguageAdapter['extractClasses']>;
  imports: ReturnType<LanguageAdapter['extractImports']>;
  exports: ReturnType<LanguageAdapter['extractExports']>;
} {
  const tree = parser.parse(source);
  const lang = parser.getLanguage();

  return {
    functions: adapter.extractFunctions(tree, lang, source, filePath),
    calls: adapter.extractCalls(tree, lang, source, filePath),
    classes: adapter.extractClasses(tree, lang, source, filePath),
    imports: adapter.extractImports(tree, lang, source, filePath),
    exports: adapter.extractExports(tree, lang, source, filePath),
  };
}
