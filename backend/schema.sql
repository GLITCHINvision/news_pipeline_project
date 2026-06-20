-- schema.sql
-- SQLite Database schema for News Pulse

CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    body TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT NOT NULL,
    published_at TEXT NOT NULL,
    cluster_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(cluster_id) REFERENCES clusters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
CREATE INDEX IF NOT EXISTS idx_articles_cluster_id ON articles(cluster_id);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
