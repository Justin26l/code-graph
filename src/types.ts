// ── Fact types (raw extracted data from tree-sitter) ──

export interface FunctionFact {
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  kind: 'function' | 'method' | 'arrow' | 'constructor';
  containerName?: string; // class/namespace name if method
  exported: boolean;
  async: boolean;
  generator: boolean;
  params: string[];
}

export interface CallFact {
  callerName: string;
  calleeName: string;
  callSiteFile: string;
  callSiteLine: number;
  callText: string;
  callKind: 'direct' | 'method' | 'constructor' | 'optionalChain' | 'tagged';
  isAwaited: boolean;
}

export interface ClassFact {
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  extendsName?: string;
  implementsNames: string[];
  methods: string[]; // method names declared in this class
}

export interface ImportFact {
  moduleSpecifier: string;
  importedNames: string[]; // named imports or ['default']
  filePath: string;
  sourceLine: number;
}

export interface ExportFact {
  name: string;
  filePath: string;
  sourceLine: number;
  isDefault: boolean;
  isReExport: boolean;
  reExportSource?: string;
}

// ── Graph node/edge types ──

export type NodeType = 'directory' | 'file' | 'module' | 'class' | 'interface' | 'function' | 'method' | 'variable' | 'export';

export interface GraphNode {
  id: string; // stable: lang:relpath:container:symbol
  type: NodeType;
  name: string;
  language: string;
  filePath: string;
  startLine: number;
  endLine: number;
  parentId?: string;
  metadata: Record<string, unknown>;
}

export type EdgeType = 'CONTAINS' | 'CALLS' | 'IMPORTS' | 'EXPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'REFERENCES';

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  edgeType: EdgeType;
  metadata: Record<string, unknown>;
}

// ── Export types ──

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Pipeline options ──

export interface ParseOptions {
  projectPath: string;
  languages: string[];
  excludePatterns: string[];
  includePatterns?: string[];
}

export interface StatsResult {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  filesParsed: number;
  languages: string[];
}
