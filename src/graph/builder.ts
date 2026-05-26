import path from 'path';
import type { GraphNode, GraphEdge, FunctionFact, CallFact, ClassFact, ImportFact, ExportFact } from '../types.js';
import type { GraphStore } from './store.js';

export class GraphBuilder {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  addFunction(fact: FunctionFact, language: string): GraphNode {
    const node = this.makeNode(fact, language);
    this.nodes.set(node.id, node);
    return node;
  }

  addCall(fact: CallFact, language: string, resolvedCalleeId?: string): GraphEdge | null {
    const callerId = this.stableId(language, fact.callSiteFile, fact.callerName);
    const calleeId = resolvedCalleeId ?? this.stableId(language, fact.callSiteFile, fact.calleeName);

    const edge: GraphEdge = {
      sourceId: callerId,
      targetId: calleeId,
      edgeType: 'CALLS',
      metadata: {
        callSiteFile: fact.callSiteFile,
        callSiteLine: fact.callSiteLine,
        callText: fact.callText,
        callKind: fact.callKind,
        isAwaited: fact.isAwaited,
      },
    };

    const key = `${edge.sourceId}|${edge.targetId}|${edge.edgeType}`;
    if (!this.edges.has(key)) {
      this.edges.set(key, edge);
    }
    return edge;
  }

  addClass(fact: ClassFact, language: string): {
    classNode: GraphNode;
    methodNodes: GraphNode[];
    edges: GraphEdge[];
  } {
    const classNode: GraphNode = {
      id: this.stableId(language, fact.filePath, fact.name),
      type: 'class',
      name: fact.name,
      language,
      filePath: fact.filePath,
      startLine: fact.startLine,
      endLine: fact.endLine,
      metadata: {
        exported: fact.exported,
        extendsName: fact.extendsName,
        implementsNames: fact.implementsNames,
      },
    };
    this.nodes.set(classNode.id, classNode);

    const methodNodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const methodName of fact.methods) {
      const methodNode: GraphNode = {
        id: this.stableId(language, fact.filePath, `${fact.name}:${methodName}`),
        type: 'method',
        name: methodName,
        language,
        filePath: fact.filePath,
        startLine: fact.startLine,
        endLine: fact.endLine,
        parentId: classNode.id,
        metadata: { containerName: fact.name },
      };
      this.nodes.set(methodNode.id, methodNode);
      methodNodes.push(methodNode);

      const containerEdge: GraphEdge = {
        sourceId: classNode.id,
        targetId: methodNode.id,
        edgeType: 'CONTAINS',
        metadata: {},
      };
      const key = `${containerEdge.sourceId}|${containerEdge.targetId}|${containerEdge.edgeType}`;
      if (!this.edges.has(key)) {
        this.edges.set(key, containerEdge);
        edges.push(containerEdge);
      }
    }

    return { classNode, methodNodes, edges };
  }

  addImport(fact: ImportFact, language: string, resolvedFile?: string): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const sourceFileId = this.stableId(language, fact.filePath, '(file)');

    for (const name of fact.importedNames) {
      // Resolve to actual file node when possible, otherwise use module specifier
      const targetId = resolvedFile
        ? this.stableId(language, resolvedFile, '(file)')
        : this.stableId(language, fact.moduleSpecifier, name);

      const edge: GraphEdge = {
        sourceId: sourceFileId,
        targetId,
        edgeType: 'IMPORTS',
        metadata: {
          moduleSpecifier: fact.moduleSpecifier,
          resolvedFile: resolvedFile ? this.relativePath(resolvedFile) : undefined,
          sourceLine: fact.sourceLine,
          importedName: name,
        },
      };
      const key = `${edge.sourceId}|${edge.targetId}|${edge.edgeType}`;
      if (!this.edges.has(key)) {
        this.edges.set(key, edge);
        edges.push(edge);
      }
    }
    return edges;
  }

  addExport(fact: ExportFact, language: string): GraphEdge | null {
    const fileNodeId = this.stableId(language, fact.filePath, '(file)');
    const exportNodeId = this.stableId(language, fact.filePath, fact.name);

    const edge: GraphEdge = {
      sourceId: fileNodeId,
      targetId: exportNodeId,
      edgeType: 'EXPORTS',
      metadata: {
        isDefault: fact.isDefault,
        isReExport: fact.isReExport,
        reExportSource: fact.reExportSource,
        sourceLine: fact.sourceLine,
      },
    };
    const key = `${edge.sourceId}|${edge.targetId}|${edge.edgeType}`;
    if (!this.edges.has(key)) {
      this.edges.set(key, edge);
    }
    return edge;
  }

  addFileNode(filePath: string, language: string): GraphNode {
    const id = this.stableId(language, filePath, '(file)');
    const existing = this.nodes.get(id);
    if (existing) return existing;

    const node: GraphNode = {
      id,
      type: 'file',
      name: path.basename(filePath),
      language,
      filePath,
      startLine: 1,
      endLine: 1,
      metadata: {},
    };
    this.nodes.set(id, node);
    return node;
  }

  addDirectoryNode(dirPath: string): GraphNode {
    const id = `dir:${this.relativePath(dirPath)}`;
    const existing = this.nodes.get(id);
    if (existing) return existing;

    const node: GraphNode = {
      id,
      type: 'directory',
      name: path.basename(dirPath),
      language: '',
      filePath: dirPath,
      startLine: 0,
      endLine: 0,
      metadata: {},
    };
    this.nodes.set(id, node);
    return node;
  }

  addContainmentEdge(parentId: string, childId: string): void {
    const edge: GraphEdge = {
      sourceId: parentId,
      targetId: childId,
      edgeType: 'CONTAINS',
      metadata: {},
    };
    const key = `${edge.sourceId}|${edge.targetId}|${edge.edgeType}`;
    if (!this.edges.has(key)) {
      this.edges.set(key, edge);
    }
  }

  buildDirectoryHierarchy(): void {
    const fileNodes = Array.from(this.nodes.values()).filter(n => n.type === 'file');

    for (const fileNode of fileNodes) {
      const dirs = this.relativePath(fileNode.filePath).split('/').slice(0, -1);
      let parentDirNode: GraphNode | null = null;

      for (let i = 0; i < dirs.length; i++) {
        const dirPath = path.join(this.projectPath, ...dirs.slice(0, i + 1));
        const dirNode = this.addDirectoryNode(dirPath);
        const nodeId = parentDirNode ? parentDirNode.id : 'dir:.';
        if (parentDirNode) {
          this.addContainmentEdge(parentDirNode.id, dirNode.id);
        }
        parentDirNode = dirNode;
      }

      if (parentDirNode) {
        this.addContainmentEdge(parentDirNode.id, fileNode.id);
      }
    }

    // Link functions to their containing file
    for (const node of Array.from(this.nodes.values())) {
      if (node.type === 'function' || node.type === 'method' || node.type === 'class') {
        const fileNodeId = this.stableId(node.language, node.filePath, '(file)');
        this.addContainmentEdge(fileNodeId, node.id);
      }
    }
  }

  save(store: GraphStore): void {
    const txnStart = Date.now();

    store.clear();
    store.insertNodes(Array.from(this.nodes.values()));
    store.insertEdges(Array.from(this.edges.values()));

    // Build name index
    for (const node of this.nodes.values()) {
      store.insertNameIndex(node.name, node.id);
    }

    console.error(`  Wrote ${this.nodes.size} nodes, ${this.edges.size} edges in ${Date.now() - txnStart}ms`);
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    return this.edges.size;
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  // ── Helpers ──

  private stableId(language: string, filePath: string, symbol: string): string {
    const relPath = this.relativePath(filePath);
    return `${language}:${relPath}:${symbol}`;
  }

  private relativePath(filePath: string): string {
    return path.relative(this.projectPath, filePath).replace(/\\/g, '/');
  }

  private makeNode(fact: FunctionFact, language: string): GraphNode {
    const container = fact.containerName ? `${fact.containerName}:` : '';
    const id = this.stableId(language, fact.filePath, `${container}${fact.name}`);

    return {
      id,
      type: fact.kind === 'method' ? 'method' : 'function',
      name: fact.name,
      language,
      filePath: fact.filePath,
      startLine: fact.startLine,
      endLine: fact.endLine,
      parentId: fact.containerName
        ? this.stableId(language, fact.filePath, fact.containerName)
        : undefined,
      metadata: {
        kind: fact.kind,
        exported: fact.exported,
        async: fact.async,
        generator: fact.generator,
        params: fact.params,
        containerName: fact.containerName,
      },
    };
  }
}
