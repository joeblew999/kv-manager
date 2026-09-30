# AGENTS.joeblew999.md — branch-local agent guide

Operational brief for any AI agent working on the `joeblew999` branch of `kv-manager`.

**Project guidance:** follow upstream project instructions and this branch-local guide.
The former shared mise library is retired; see [MISE-RETIREMENT.md](MISE-RETIREMENT.md).

## What this repo is

Cloudflare KV admin UI fork. Same lifecycle as d1-manager.

## Branch-local quirks

None branch-local.

## Mise wiring

[mise.toml](mise.toml) contains only local tasks. The shared pre-push `check`
wrapper has been retired; run the project checks appropriate to your changes.
