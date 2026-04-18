import Database, { type Database as DB } from 'better-sqlite3';

import type { Confidence, Fact, FactFilter, FactInput, SourceAgent } from '@atlas/shared';

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS facts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT    NOT NULL,
  source_agent    TEXT    NOT NULL CHECK (source_agent IN ('code-spelunker','ui-explorer','traffic-sniffer','doc-harvester')),
  fact_type       TEXT    NOT NULL,
  content         TEXT    NOT NULL,
  evidence_uri    TEXT    NOT NULL,
  confidence      TEXT    NOT NULL CHECK (confidence IN ('high','medium','low')),
  conflicts_with  TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_facts_run       ON facts(run_id);
CREATE INDEX IF NOT EXISTS idx_facts_run_agent ON facts(run_id, source_agent);
CREATE INDEX IF NOT EXISTS idx_facts_run_type  ON facts(run_id, fact_type);
`;

interface FactRow {
  readonly id: number;
  readonly run_id: string;
  readonly source_agent: SourceAgent;
  readonly fact_type: string;
  readonly content: string;
  readonly evidence_uri: string;
  readonly confidence: Confidence;
  readonly conflicts_with: string | null;
  readonly created_at: string;
}

export class Scratchpad {
  private readonly db: DB;

  constructor(path: string) {
    this.db = new Database(path);
    // WAL mode allows concurrent readers while a writer is active; required when
    // four source-agent subagents may write to the same scratchpad in parallel.
    this.db.pragma('journal_mode = WAL');
  }

  migrate(): void {
    this.db.exec(SCHEMA_DDL);
  }

  insertFact(input: FactInput): number {
    const stmt = this.db.prepare(`
      INSERT INTO facts (run_id, source_agent, fact_type, content, evidence_uri, confidence, conflicts_with)
      VALUES (@run_id, @source_agent, @fact_type, @content, @evidence_uri, @confidence, @conflicts_with)
    `);
    const result = stmt.run({
      run_id: input.run_id,
      source_agent: input.source_agent,
      fact_type: input.fact_type,
      content: JSON.stringify(input.content),
      evidence_uri: input.evidence_uri,
      confidence: input.confidence,
      conflicts_with: input.conflicts_with ? JSON.stringify(input.conflicts_with) : null,
    });
    return Number(result.lastInsertRowid);
  }

  selectFacts(filter: FactFilter): Fact[] {
    const where: string[] = ['run_id = @run_id'];
    const params: Record<string, string> = { run_id: filter.run_id };

    if (filter.source_agent !== undefined) {
      where.push('source_agent = @source_agent');
      params['source_agent'] = filter.source_agent;
    }
    if (filter.fact_type !== undefined) {
      where.push('fact_type = @fact_type');
      params['fact_type'] = filter.fact_type;
    }

    const sql = `SELECT * FROM facts WHERE ${where.join(' AND ')} ORDER BY id ASC`;
    const rows = this.db.prepare(sql).all(params) as FactRow[];
    return rows.map(rowToFact);
  }

  countFacts(runId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM facts WHERE run_id = ?').get(runId) as
      | { n: number }
      | undefined;
    return row?.n ?? 0;
  }

  close(): void {
    this.db.close();
  }
}

function rowToFact(row: FactRow): Fact {
  const base = {
    id: row.id,
    run_id: row.run_id,
    source_agent: row.source_agent,
    fact_type: row.fact_type,
    content: JSON.parse(row.content) as Record<string, unknown>,
    evidence_uri: row.evidence_uri,
    confidence: row.confidence,
    created_at: row.created_at,
  };
  if (row.conflicts_with === null) return base;
  return { ...base, conflicts_with: JSON.parse(row.conflicts_with) as number[] };
}
