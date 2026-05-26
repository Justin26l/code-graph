import Database from 'better-sqlite3';
import type { GraphNode, GraphEdge, StatsResult } from '../types.js';
import { SCHEMA_SQL } from './schema.js';
import path from 'path';
import fs from 'fs';

export class GraphStore {
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec('PRAGMA synchronous=NORMAL');
    this.db.exec('PRAGMA foreign_keys = OFF');
  }

  static create(dbPath: string): GraphStore {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const db = new Database(dbPath);
    const store = new GraphStore(db);
    store.ensureSchema();
    return store;
  }

  static open(dbPath: string): GraphStore {
    const db = new Database(dbPath);
    const store = new GraphStore(db);
    return store;
  }

  private ensureSchema(): void {
    this.db.exec(SCHEMA_SQL);
  }

  clear(): void {
    this.db.exec('DELETE FROM name_index');
    this.db.exec('DELETE FROM edges');
    this.db.exec('DELETE FROM nodes');
    this.db.exec('DELETE FROM file_manifest');
  }

  insertNode(node: GraphNode): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO nodes (id, type, name, language, file_path, start_line, end_line, parent_id, metadata)
      VALUES (@id, @type, @name, @language, @filePath, @startLine, @endLine, @parentId, @metadata)
    `).run({
      ...node,
      parentId: node.parentId ?? null,
      metadata: JSON.stringify(node.metadata),
    });
  }

  insertEdge(edge: GraphEdge): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO edges (source_id, target_id, edge_type, metadata)
      VALUES (@sourceId, @targetId, @edgeType, @metadata)
    `).run({
      ...edge,
      metadata: JSON.stringify(edge.metadata),
    });
  }

  insertNameIndex(name: string, nodeId: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO name_index (name, node_id)
      VALUES (@name, @nodeId)
    `).run({ name, nodeId });
  }

  recordFile(filePath: string, language: string, size: number): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO file_manifest (path, language, size)
      VALUES (@path, @language, @size)
    `).run({ path: filePath, language, size });
  }

  // ── Bulk inserts in a transaction ──

  insertNodes(nodes: GraphNode[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO nodes (id, type, name, language, file_path, start_line, end_line, parent_id, metadata)
      VALUES (@id, @type, @name, @language, @filePath, @startLine, @endLine, @parentId, @metadata)
    `);

    const txn = this.db.transaction((items: GraphNode[]) => {
      for (const node of items) {
        insert.run({
          ...node,
          parentId: node.parentId ?? null,
          metadata: JSON.stringify(node.metadata),
        });
      }
    });

    txn(nodes);
  }

  insertEdges(edges: GraphEdge[]): void {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO edges (source_id, target_id, edge_type, metadata)
      VALUES (@sourceId, @targetId, @edgeType, @metadata)
    `);

    const txn = this.db.transaction((items: GraphEdge[]) => {
      for (const edge of items) {
        insert.run({
          ...edge,
          metadata: JSON.stringify(edge.metadata),
        });
      }
    });

    txn(edges);
  }

  // ── Queries ──

  getNode(id: string): GraphNode | undefined {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as Row | undefined;
    return row ? rowToNode(row) : undefined;
  }

  getNodeByName(name: string): GraphNode[] {
    const rows = this.db.prepare(`
      SELECT n.* FROM nodes n
      INNER JOIN name_index ni ON n.id = ni.node_id
      WHERE ni.name = ?
    `).all(name) as Row[];
    return rows.map(rowToNode);
  }

  getNodesByFile(filePath: string): GraphNode[] {
    const rows = this.db.prepare(`
      SELECT * FROM nodes WHERE file_path = ? ORDER BY start_line
    `).all(filePath) as Row[];
    return rows.map(rowToNode);
  }

  getNeighbors(nodeId: string): { node: GraphNode; edge: GraphEdge }[] {
    const rows = this.db.prepare(`
      SELECT n.*, e.source_id, e.target_id, e.edge_type, e.metadata as edge_metadata
      FROM edges e
      INNER JOIN nodes n ON (n.id = e.target_id OR n.id = e.source_id)
      WHERE (e.source_id = ? OR e.target_id = ?) AND n.id != ?
    `).all(nodeId, nodeId, nodeId) as NeighborRow[];

    return rows.map(r => ({
      node: rowToNode(r),
      edge: {
        sourceId: r.source_id,
        targetId: r.target_id,
        edgeType: r.edge_type as GraphEdge['edgeType'],
        metadata: JSON.parse(r.edge_metadata || '{}'),
      },
    }));
  }

  getCallers(nodeId: string): GraphNode[] {
    const rows = this.db.prepare(`
      SELECT n.* FROM edges e
      INNER JOIN nodes n ON n.id = e.source_id
      WHERE e.target_id = ? AND e.edge_type = 'CALLS'
    `).all(nodeId) as Row[];
    return rows.map(rowToNode);
  }

  getCallees(nodeId: string): GraphNode[] {
    const rows = this.db.prepare(`
      SELECT n.* FROM edges e
      INNER JOIN nodes n ON n.id = e.target_id
      WHERE e.source_id = ? AND e.edge_type = 'CALLS'
    `).all(nodeId) as Row[];
    return rows.map(rowToNode);
  }

  search(query: string, type?: string): GraphNode[] {
    let sql = `SELECT * FROM nodes WHERE name LIKE ?`;
    const params: unknown[] = [`%${query}%`];

    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }

    sql += ` LIMIT 100`;
    const rows = this.db.prepare(sql).all(...params) as Row[];
    return rows.map(rowToNode);
  }

  getAllNodes(): GraphNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes').all() as Row[];
    return rows.map(rowToNode);
  }

  getAllEdges(): GraphEdge[] {
    const rows = this.db.prepare('SELECT * FROM edges').all() as EdgeRow[];
    return rows.map(rowToEdge);
  }

  getStats(): StatsResult {
    const nodeCount = (this.db.prepare('SELECT COUNT(*) as c FROM nodes').get() as { c: number }).c;
    const edgeCount = (this.db.prepare('SELECT COUNT(*) as c FROM edges').get() as { c: number }).c;
    const nodesByType = this.db.prepare('SELECT type, COUNT(*) as c FROM nodes GROUP BY type').all() as { type: string; c: number }[];
    const edgesByType = this.db.prepare('SELECT edge_type, COUNT(*) as c FROM edges GROUP BY edge_type').all() as { edge_type: string; c: number }[];
    const filesParsed = (this.db.prepare('SELECT COUNT(*) as c FROM file_manifest').get() as { c: number }).c;
    const languages = this.db.prepare('SELECT DISTINCT language FROM file_manifest').all() as { language: string }[];

    return {
      nodeCount,
      edgeCount,
      nodesByType: Object.fromEntries(nodesByType.map(r => [r.type, r.c])),
      edgesByType: Object.fromEntries(edgesByType.map(r => [r.edge_type, r.c])),
      filesParsed,
      languages: languages.map(r => r.language),
    };
  }

  close(): void {
    this.db.close();
  }
}

// ── Row types ──

interface Row {
  id: string;
  type: string;
  name: string;
  language: string;
  file_path: string;
  start_line: number;
  end_line: number;
  parent_id: string | null;
  metadata: string;
}

interface EdgeRow {
  source_id: string;
  target_id: string;
  edge_type: string;
  metadata: string;
}

interface NeighborRow extends Row {
  source_id: string;
  target_id: string;
  edge_type: string;
  edge_metadata: string;
}

function rowToNode(row: Row): GraphNode {
  return {
    id: row.id,
    type: row.type as GraphNode['type'],
    name: row.name,
    language: row.language,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    parentId: row.parent_id ?? undefined,
    metadata: JSON.parse(row.metadata || '{}'),
  };
}

function rowToEdge(row: EdgeRow): GraphEdge {
  return {
    sourceId: row.source_id,
    targetId: row.target_id,
    edgeType: row.edge_type as GraphEdge['edgeType'],
    metadata: JSON.parse(row.metadata || '{}'),
  };
}
