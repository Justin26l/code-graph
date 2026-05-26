export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS nodes (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  language    TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  start_line  INTEGER,
  end_line    INTEGER,
  parent_id   TEXT,
  metadata    TEXT DEFAULT '{}',
  FOREIGN KEY (parent_id) REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);

CREATE TABLE IF NOT EXISTS edges (
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  edge_type   TEXT NOT NULL,
  metadata    TEXT DEFAULT '{}',
  PRIMARY KEY (source_id, target_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(edge_type);

CREATE TABLE IF NOT EXISTS name_index (
  name    TEXT NOT NULL,
  node_id TEXT NOT NULL,
  PRIMARY KEY (name, node_id)
);

CREATE TABLE IF NOT EXISTS file_manifest (
  path     TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  size     INTEGER NOT NULL,
  parsed_at TEXT DEFAULT (datetime('now'))
);
`;

export const DROP_SQL = `
DROP TABLE IF EXISTS name_index;
DROP TABLE IF EXISTS edges;
DROP TABLE IF EXISTS nodes;
DROP TABLE IF EXISTS file_manifest;
`;
