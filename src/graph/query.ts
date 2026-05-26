import type { GraphNode, GraphEdge, GraphData } from '../types.js';
import type { GraphStore } from './store.js';

export class GraphQuery {
  private store: GraphStore;

  constructor(store: GraphStore) {
    this.store = store;
  }

  getNode(id: string): GraphNode | undefined {
    return this.store.getNode(id);
  }

  search(query: string, type?: string): GraphNode[] {
    return this.store.search(query, type);
  }

  callersOf(nodeId: string): GraphNode[] {
    return this.store.getCallers(nodeId);
  }

  calleesOf(nodeId: string): GraphNode[] {
    return this.store.getCallees(nodeId);
  }

  neighbors(nodeId: string): { node: GraphNode; edge: GraphEdge }[] {
    return this.store.getNeighbors(nodeId);
  }

  exportsOf(filePath: string): GraphNode[] {
    const nodes = this.store.getNodesByFile(filePath);
    return nodes.filter(n => n.type === 'export');
  }

  nodesByFile(filePath: string): GraphNode[] {
    return this.store.getNodesByFile(filePath);
  }

  allNodes(): GraphNode[] {
    return this.store.getAllNodes();
  }

  allEdges(): GraphEdge[] {
    return this.store.getAllEdges();
  }

  toGraphData(): GraphData {
    return {
      nodes: this.store.getAllNodes(),
      edges: this.store.getAllEdges(),
    };
  }

  subgraphFrom(entryNodeId: string, maxDepth: number = 3): GraphData {
    const visited = new Set<string>();
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const walk = (nodeId: string, depth: number) => {
      if (depth > maxDepth || visited.has(nodeId)) return;
      visited.add(nodeId);

      const node = this.store.getNode(nodeId);
      if (!node) return;
      nodes.push(node);

      const neighbors = this.store.getNeighbors(nodeId);
      for (const { node: neighborNode, edge } of neighbors) {
        edges.push(edge);
        walk(neighborNode.id, depth + 1);
      }
    };

    walk(entryNodeId, 0);
    return { nodes, edges };
  }
}
