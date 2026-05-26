import type { GraphData, GraphNode, GraphEdge } from '../types.js';

export interface JsonExport {
  version: string;
  generatedAt: string;
  stats: {
    nodeCount: number;
    edgeCount: number;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function toJson(graphData: GraphData): string {
  const exportData: JsonExport = {
    version: '0.1.0',
    generatedAt: new Date().toISOString(),
    stats: {
      nodeCount: graphData.nodes.length,
      edgeCount: graphData.edges.length,
    },
    nodes: graphData.nodes,
    edges: graphData.edges,
  };

  return JSON.stringify(exportData, null, 2);
}
