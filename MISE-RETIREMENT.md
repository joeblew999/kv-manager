# Shared mise workflow retirement

The shared task imports have been removed. They are not copied into this repository.
Cloudflare provisioning, secret synchronization, shared validation and bootstrap tasks
previously provided by those imports are no longer available.

Removed local tasks: `10-deploy`, `10b-redeploy`, `6-build`, `check`, `dev`, `env:dump`, `prove:all`, `secrets:cf:list`, `tail`.

Independent tools and project tasks remain in `mise.toml`. Removed orchestration
was retired with its prerequisites, so it cannot report success after skipping
validation, configuration generation or security checks. Use `mise tasks` to inspect
the remaining commands. This change does not deploy or change production resources.
