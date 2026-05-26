import Parser from 'tree-sitter';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export type SupportedLanguage = 'ts' | 'js' | 'tsx' | 'py' | 'go';

interface LanguageLoadResult {
  language: SupportedLanguage;
  grammar: Parser.Language;
}

const grammarCache = new Map<string, LanguageLoadResult>();

export function createParser(languages: string[]): Parser {
  const parser = new Parser();
  const grammar = getGrammar(languages);
  if (!grammar) {
    throw new Error(
      `No supported language found in: ${languages.join(', ')}. ` +
      `Supported: ts, js, tsx, py, go`
    );
  }
  parser.setLanguage(grammar);
  return parser;
}

function getGrammar(languages: string[]): Parser.Language | null {
  for (const lang of languages) {
    const result = loadGrammar(lang);
    if (result) return result.grammar;
  }
  return null;
}

function loadGrammar(lang: string): LanguageLoadResult | null {
  if (grammarCache.has(lang)) return grammarCache.get(lang)!;

  let result: LanguageLoadResult | null = null;

  switch (lang) {
    case 'ts':
    case 'js':
    case 'tsx': {
      const mod: { typescript: Parser.Language; tsx: Parser.Language } =
        require('tree-sitter-typescript');
      result = { language: 'ts', grammar: mod.typescript };
      break;
    }
    case 'py': {
      const mod: { language: Parser.Language } =
        require('tree-sitter-python');
      result = { language: 'py', grammar: mod.language };
      break;
    }
    case 'go': {
      const mod: { language: Parser.Language } =
        require('tree-sitter-go');
      result = { language: 'go', grammar: mod.language };
      break;
    }
  }

  if (result) grammarCache.set(lang, result);
  return result;
}

export function detectLanguage(filePath: string): SupportedLanguage | null {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.ts') || filePath.endsWith('.d.ts')) return 'ts';
  if (filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'js';
  if (filePath.endsWith('.js')) return 'js';
  if (filePath.endsWith('.py')) return 'py';
  if (filePath.endsWith('.go')) return 'go';
  return null;
}

export function fileExtensionsFor(languages: string[]): string[] {
  const exts: string[] = [];
  for (const lang of languages) {
    switch (lang) {
      case 'ts': exts.push('.ts', '.d.ts'); break;
      case 'js': exts.push('.js', '.mjs', '.cjs'); break;
      case 'tsx': exts.push('.tsx'); break;
      case 'py': exts.push('.py'); break;
      case 'go': exts.push('.go'); break;
    }
  }
  return exts;
}
