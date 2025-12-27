# Changelog

The KV Database Manager changelog is maintained in the project wiki.

## 📚 View the Changelog

**Wiki:** [Changelog](https://github.com/neverinfamous/kv-manager/wiki)

**GitHub Repository:** [neverinfamous/kv-manager](https://github.com/neverinfamous/kv-manager)

## Recent Changes

### December 27, 2025

- **Added** Webhooks Dashboard - Event-driven HTTP notifications for KV operations
  - Create, edit, delete, and test webhooks from the UI
  - 13 KV-specific event types (key operations, bulk jobs, import/export, backup/restore, failures)
  - HMAC signature support for secure webhook verification
  - Enable/disable toggle for each webhook
  - Integrated into automated D1 migration system (migration version 6)

### December 17, 2025

- **Removed** `MIGRATION_GUIDE.md` - Redundant with the automated in-app migration system and wiki documentation. All migration information is now consolidated in the [wiki Migration Guide](https://github.com/neverinfamous/kv-manager/wiki/Migration-Guide).

---

The wiki changelog includes:
- All version history and release notes
- Detailed feature descriptions
- Bug fixes and improvements
- Breaking changes and migration guides

For the latest updates, please refer to the wiki.
