import Parser from 'tree-sitter';
import type { ClassFact, FunctionFact, CallFact, ImportFact, ExportFact } from '../types.js';

export interface LanguageAdapter {
  readonly language: string;
  readonly fileExtensions: string[];
  extractFunctions(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): FunctionFact[];
  extractCalls(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): CallFact[];
  extractClasses(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): ClassFact[];
  extractImports(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): ImportFact[];
  extractExports(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): ExportFact[];
}
