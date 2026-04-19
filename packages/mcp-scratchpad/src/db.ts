import Database, { type Database as DB } from 'better-sqlite3';

import type {
    Confidence,
    Fact,
    FactFilter,
    FactInput,
    MergedFact,
    MergedFactFilter,
    MergedFactInput,
    Resolution,
    SourceAgent,
} from '@atlas/shared';

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

CREATE TABLE IF NOT EXISTS merged_facts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           TEXT    NOT NULL,
  fact_type        TEXT    NOT NULL,
  content          TEXT    NOT NULL,
  resolution       TEXT    NOT NULL CHECK (resolution IN ('unanimous','priority','recency','confidence','unresolved')),
  source_fact_ids  TEXT    NOT NULL,
  winning_source   TEXT    CHECK (winning_source IS NULL OR winning_source IN ('code-spelunker','ui-explorer','traffic-sniffer','doc-harvester')),
  confidence       TEXT    NOT NULL CHECK (confidence IN ('high','medium','low')),
  conflicts        TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_merged_run            ON merged_facts(run_id);
CREATE INDEX IF NOT EXISTS idx_merged_run_type       ON merged_facts(run_id, fact_type);
CREATE INDEX IF NOT EXISTS idx_merged_run_resolution ON merged_facts(run_id, resolution);
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
        const row = this.db
            .prepare('SELECT COUNT(*) AS n FROM facts WHERE run_id = ?')
            .get(runId) as { n: number } | undefined;
        return row?.n ?? 0;
    }

    insertMergedFact(input: MergedFactInput): number {
        const stmt = this.db.prepare(`
      INSERT INTO merged_facts (run_id, fact_type, content, resolution, source_fact_ids, winning_source, confidence, conflicts)
      VALUES (@run_id, @fact_type, @content, @resolution, @source_fact_ids, @winning_source, @confidence, @conflicts)
    `);
        const result = stmt.run({
            run_id: input.run_id,
            fact_type: input.fact_type,
            content: JSON.stringify(input.content),
            resolution: input.resolution,
            source_fact_ids: JSON.stringify(input.source_fact_ids),
            winning_source: input.winning_source,
            confidence: input.confidence,
            conflicts: input.conflicts ? JSON.stringify(input.conflicts) : null,
        });
        return Number(result.lastInsertRowid);
    }

    selectMergedFacts(filter: MergedFactFilter): MergedFact[] {
        const where: string[] = ['run_id = @run_id'];
        const params: Record<string, string> = { run_id: filter.run_id };

        if (filter.fact_type !== undefined) {
            where.push('fact_type = @fact_type');
            params['fact_type'] = filter.fact_type;
        }
        if (filter.resolution !== undefined) {
            where.push('resolution = @resolution');
            params['resolution'] = filter.resolution;
        }

        const sql = `SELECT * FROM merged_facts WHERE ${where.join(' AND ')} ORDER BY id ASC`;
        const rows = this.db.prepare(sql).all(params) as MergedFactRow[];
        return rows.map(rowToMergedFact);
    }

    deleteMergedFacts(runId: string): number {
        const result = this.db.prepare('DELETE FROM merged_facts WHERE run_id = ?').run(runId);
        return Number(result.changes);
    }

    countMergedFacts(runId: string): number {
        const row = this.db
            .prepare('SELECT COUNT(*) AS n FROM merged_facts WHERE run_id = ?')
            .get(runId) as { n: number } | undefined;
        return row?.n ?? 0;
    }

    close(): void {
        this.db.close();
    }
}

interface MergedFactRow {
    readonly id: number;
    readonly run_id: string;
    readonly fact_type: string;
    readonly content: string;
    readonly resolution: Resolution;
    readonly source_fact_ids: string;
    readonly winning_source: SourceAgent | null;
    readonly confidence: Confidence;
    readonly conflicts: string | null;
    readonly created_at: string;
}

function rowToMergedFact(row: MergedFactRow): MergedFact {
    const base = {
        id: row.id,
        run_id: row.run_id,
        fact_type: row.fact_type,
        content: JSON.parse(row.content) as Record<string, unknown>,
        resolution: row.resolution,
        source_fact_ids: JSON.parse(row.source_fact_ids) as number[],
        winning_source: row.winning_source,
        confidence: row.confidence,
        created_at: row.created_at,
    };
    if (row.conflicts === null) return base;
    return { ...base, conflicts: JSON.parse(row.conflicts) as number[] };
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
