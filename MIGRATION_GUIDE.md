# Migration Guide

This guide helps you migrate your KV Manager database to work with the latest version.

## Automated In-App Migrations (Recommended)

KV Manager now includes an **automated migration system** with an in-app upgrade banner:

1. **Launch the app** - When schema updates are available, a yellow banner appears at the top of the page
2. **Click "Upgrade Now"** - The system automatically applies all pending migrations
3. **Done!** - A green success banner confirms the upgrade completed

The automated system:
- Detects legacy installations and handles them automatically
- Tracks applied migrations in a `schema_version` table
- Is idempotent (safe to run multiple times)
- Shows detailed error messages if something goes wrong

## Manual Migration (Alternative)

If you prefer to run migrations manually via command line:

```bash
wrangler d1 execute kv-manager-metadata --remote --file=worker/migrations/apply_all_migrations.sql
```

This script is **idempotent** and safe to run multiple times.

## Fresh Installation

If you're installing KV Manager for the first time, use the main schema file:

```bash
wrangler d1 execute kv-manager-metadata --remote --file=worker/schema.sql
```

The schema includes all tables needed for KV Manager. The in-app migration system will track that no migrations are pending.

## What Gets Migrated?

The migration system tracks five migrations:

### Version 1: Initial Schema
Base schema with namespaces, key_metadata, audit_log, and bulk_jobs tables.

### Version 2: Job Audit Events
Adds the `job_audit_events` table for tracking job lifecycle events (started, progress milestones, completed, etc.).

### Version 3: Webhooks
Adds the `webhooks` table for external observability notifications.

### Version 4: Namespace Colors
Adds the `namespace_colors` table for visual namespace organization with color tags.

### Version 5: Key Colors
Adds the `key_colors` table for visual key organization with color tags.

## Troubleshooting

### Banner not showing when expected
- Refresh the page to re-check migration status
- Check the browser console for API errors

### "Upgrade Now" fails
- Check the error message displayed in the banner
- Verify D1 database binding is correctly configured
- Try the manual migration command as a fallback

### Verify Migration Success

Check the schema_version table:

```bash
wrangler d1 execute kv-manager-metadata --remote --command="SELECT * FROM schema_version"
```

You should see entries for each applied migration version.

## Local Development

For local development, the in-app migration system works the same way. Alternatively:

```bash
wrangler d1 execute kv-manager-metadata-dev --local --file=worker/migrations/apply_all_migrations.sql
```

## Need Help?

If you encounter any issues with the migration, please open an issue on GitHub with:
- The error message
- Your database binding name
- Whether you're running in production or development
