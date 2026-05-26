import Parser from 'tree-sitter';
import type { LanguageAdapter } from '../adapter.js';
import type { FunctionFact, CallFact, ClassFact, ImportFact, ExportFact } from '../../types.js';

export const typeScriptAdapter: LanguageAdapter = {
  language: 'ts',
  fileExtensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs'],

  extractFunctions(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): FunctionFact[] {
    const facts: FunctionFact[] = [];
    const query = new Parser.Query(
      language,
      `
      (function_declaration
        name: (identifier) @fn.name
        (statement_block) @fn.body) @fn.decl

      (method_definition
        name: (property_identifier) @fn.name
        body: (statement_block) @fn.body) @fn.decl

      (generator_function_declaration
        name: (identifier) @fn.name
        body: (statement_block) @fn.body) @fn.gen

      (variable_declarator
        name: (identifier) @fn.name
        value: (arrow_function) @fn.body) @fn.var
      `
    );

    const matches = query.matches(tree.rootNode);
    for (const match of matches) {
      const declNode = match.captures.find(c => c.name === 'fn.decl')?.node
        ?? match.captures.find(c => c.name === 'fn.gen')?.node;
      const nameNode = match.captures.find(c => c.name === 'fn.name')?.node;
      const genNode = match.captures.find(c => c.name === 'fn.gen')?.node;
      const varDeclNode = match.captures.find(c => c.name === 'fn.var')?.node;

      if (declNode && nameNode) {
        const parent = getParentClass(tree.rootNode, declNode);
        const methodNodes = declNode.children.filter(
          c => c.type === 'method_definition'
        );
        facts.push({
          name: nameNode.text,
          filePath,
          startLine: declNode.startPosition.row + 1,
          endLine: declNode.endPosition.row + 1,
          kind: methodNodes.length > 0 || parent ? 'method' : 'function',
          containerName: parent ?? undefined,
          exported: isExported(declNode),
          async: hasModifier(declNode, 'async'),
          generator: !!genNode,
          params: extractParamNames(declNode),
        });
      }

      // Variable-declared arrow function: const foo = () => { ... }
      if (varDeclNode && nameNode) {
        const exported = isExported(varDeclNode);
        facts.push({
          name: nameNode.text,
          filePath,
          startLine: varDeclNode.startPosition.row + 1,
          endLine: varDeclNode.endPosition.row + 1,
          kind: 'function',
          containerName: undefined,
          exported,
          async: false,
          generator: false,
          params: extractParamNames(varDeclNode),
        });
      }

    }

    return facts;
  },

  extractCalls(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): CallFact[] {
    const facts: CallFact[] = [];
    const query = new Parser.Query(
      language,
      `
      (call_expression
        function: (identifier) @callee.name
        arguments: (arguments) @callee.args) @call

      (call_expression
        function: (member_expression
          property: (property_identifier) @callee.name)
        arguments: (arguments) @callee.args) @call.method

      (await_expression
        (call_expression) @call.await) @call.awaited

      (new_expression
        constructor: (identifier) @callee.name) @call.new
      `
    );

    const matches = query.matches(tree.rootNode);
    for (const match of matches) {
      const callNode = match.captures.find(c =>
        c.name === 'call' || c.name === 'call.method' || c.name === 'call.new' || c.name === 'call.await' || c.name === 'call.awaited'
      );
      const nameNode = match.captures.find(c => c.name === 'callee.name');
      if (!callNode || !nameNode) continue;

      const isAwaited = match.captures.some(c => c.name === 'call.awaited');
      const isNew = match.captures.some(c => c.name === 'call.new');
      const isMethod = match.captures.some(c => c.name === 'call.method');

      facts.push({
        callerName: getEnclosingFunctionName(tree.rootNode, callNode.node),
        calleeName: nameNode.node.text,
        callSiteFile: filePath,
        callSiteLine: callNode.node.startPosition.row + 1,
        callText: callNode.node.text.slice(0, 80),
        callKind: isNew ? 'constructor' : isMethod ? 'method' : 'direct',
        isAwaited,
      });
    }

    return facts;
  },

  extractClasses(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): ClassFact[] {
    const facts: ClassFact[] = [];
    const query = new Parser.Query(
      language,
      `
      (class_declaration
        name: (type_identifier) @class.name
        body: (class_body) @class.body) @class.decl

      (abstract_class_declaration
        name: (type_identifier) @class.name
        body: (class_body) @class.body) @class.decl
      `
    );

    const matches = query.matches(tree.rootNode);
    for (const match of matches) {
      const declNode = match.captures.find(c => c.name === 'class.decl')?.node;
      const nameNode = match.captures.find(c => c.name === 'class.name')?.node;
      const bodyNode = match.captures.find(c => c.name === 'class.body')?.node;
      if (!declNode || !nameNode || !bodyNode) continue;

      const classHeritage = findChild(declNode, 'class_heritage');
      const extendsClause = classHeritage ? findChild(classHeritage, 'extends_clause') : undefined;
      const implementsClause = classHeritage ? findChild(classHeritage, 'implements_clause') : undefined;

      facts.push({
        name: nameNode.text,
        filePath,
        startLine: declNode.startPosition.row + 1,
        endLine: declNode.endPosition.row + 1,
        exported: isExported(declNode),
        extendsName: extendsClause
          ? (findChild(extendsClause, 'type_identifier') ?? findChild(extendsClause, 'identifier'))?.text
          : undefined,
        implementsNames: implementsClause
          ? findAllChildren(implementsClause, 'type_identifier').map(n => n.text)
          : [],
        methods: bodyNode.children
          .filter(c => c.type === 'method_definition')
          .map(c => findChild(c, 'property_identifier')?.text ?? '')
          .filter(Boolean),
      });
    }

    return facts;
  },

  extractImports(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): ImportFact[] {
    const facts: ImportFact[] = [];
    const query = new Parser.Query(
      language,
      `
      (import_statement
        source: (string) @import.source) @import.stmt

      (import_require_clause
        source: (string) @import.source) @import.req
      `
    );

    const matches = query.matches(tree.rootNode);
    for (const match of matches) {
      const stmtNode = match.captures.find(c =>
        c.name === 'import.stmt' || c.name === 'import.req'
      )?.node;
      const sourceNode = match.captures.find(c => c.name === 'import.source')?.node;
      if (!stmtNode || !sourceNode) continue;

      const moduleSpecifier = sourceNode.text.slice(1, -1); // strip quotes

      // Find the import_clause child (named imports, default, namespace are nested inside it)
      const importClause = findChild(stmtNode, 'import_clause');
      const namedImportsNode = importClause ? findChild(importClause, 'named_imports') : undefined;
      const defaultImport = importClause ? findChild(importClause, 'identifier') : undefined;
      const namespaceImport = importClause ? findChild(importClause, 'namespace_import') : undefined;

      const importedNames: string[] = [];
      if (namedImportsNode) {
        for (const spec of findAllChildren(namedImportsNode, 'import_specifier')) {
          const nameChild = findChild(spec, 'identifier');
          importedNames.push(nameChild?.text ?? '?');
        }
      }
      if (defaultImport) {
        importedNames.push('default');
      }
      if (namespaceImport) {
        importedNames.push('*');
      }

      if (importedNames.length === 0) importedNames.push('*');

      facts.push({
        moduleSpecifier,
        importedNames,
        filePath,
        sourceLine: stmtNode.startPosition.row + 1,
      });
    }

    return facts;
  },

  extractExports(tree: Parser.Tree, language: Parser.Language, source: string, filePath: string): ExportFact[] {
    const facts: ExportFact[] = [];
    const query = new Parser.Query(
      language,
      `
      (export_statement
        (function_declaration
          name: (identifier) @export.name)) @export.fn

      (export_statement
        (class_declaration
          name: (type_identifier) @export.name)) @export.class

      (export_statement
        (variable_declaration
          (variable_declarator
            name: (identifier) @export.name))) @export.var
      (export_statement
        (lexical_declaration
          (variable_declarator
            name: (identifier) @export.name))) @export.let

      (export_statement
        (export_clause
          (export_specifier
            name: (identifier) @export.name))) @export.spec

      (export_statement
        value: (string) @export.source) @export.re
      `
    );

    const matches = query.matches(tree.rootNode);
    for (const match of matches) {
      const nameNode = match.captures.find(c => c.name === 'export.name');
      const sourceNode = match.captures.find(c => c.name === 'export.source');
      const isReExport = match.captures.some(c => c.name === 'export.re') || !!sourceNode;

      facts.push({
        name: nameNode?.node.text ?? '(re-export)',
        filePath,
        sourceLine: match.captures[0].node.startPosition.row + 1,
        isDefault: false, // FIXME: detect default exports
        isReExport,
        reExportSource: sourceNode?.node.text.slice(1, -1),
      });
    }

    return facts;
  },
};

// ── Helper functions ──

function findChild(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode | undefined {
  return node.children.find(c => c.type === type);
}

function findAllChildren(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[] {
  return node.children.filter(c => c.type === type);
}

function isExported(node: Parser.SyntaxNode): boolean {
  // Direct export: export function foo() {} or export class Foo {}
  if (node.parent?.type === 'export_statement') return true;
  // Variable export: export const foo = () => {} (node.parent = variable_declaration)
  if (node.parent?.parent?.type === 'export_statement') return true;
  return false;
}

function hasModifier(node: Parser.SyntaxNode, modifier: string): boolean {
  return node.children.some(c => c.type === modifier);
}

function extractParamNames(node: Parser.SyntaxNode): string[] {
  const paramsList = findChild(node, 'formal_parameters')
    ?? findChild(node, 'parameters');
  if (!paramsList) return [];
  return paramsList.children
    .filter(c =>
      c.type === 'identifier' ||
      c.type === 'required_parameter' ||
      c.type === 'optional_parameter'
    )
    .map(c => c.text);
}

function getParentClass(root: Parser.SyntaxNode, node: Parser.SyntaxNode): string | null {
  let cursor = node.parent;
  while (cursor && cursor !== root) {
    if (cursor.type === 'class_declaration' || cursor.type === 'abstract_class_declaration') {
      const nameNode = findChild(cursor, 'type_identifier');
      return nameNode?.text ?? null;
    }
    cursor = cursor.parent;
  }
  return null;
}

function getEnclosingFunctionName(root: Parser.SyntaxNode, node: Parser.SyntaxNode): string {
  let cursor = node.parent;
  while (cursor && cursor !== root) {
    if (cursor.type === 'function_declaration') {
      const nameNode = findChild(cursor, 'identifier');
      return nameNode?.text ?? '(anonymous)';
    }
    if (cursor.type === 'method_definition') {
      const nameNode = findChild(cursor, 'property_identifier');
      return nameNode?.text ?? '(anonymous)';
    }
    // const foo = () => { ... } — only if the value is an arrow/function
    if (cursor.type === 'variable_declarator') {
      const valueNode = findChild(cursor, 'arrow_function') ?? findChild(cursor, 'function');
      if (valueNode) {
        const nameNode = findChild(cursor, 'identifier');
        if (nameNode) return nameNode.text;
      }
    }
    cursor = cursor.parent;
  }
  return '(top-level)';
}
