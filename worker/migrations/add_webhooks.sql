-- Migration: Add webhooks table
-- Note: This migration is included in apply_all_migrations.sql - prefer running that instead
-- Run: wrangler d1 execute YOUR_DATABASE_NAME --remote --file=worker/migrations/apply_all_migrations.sql

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT NOT NULL, -- JSON array of event types
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);

