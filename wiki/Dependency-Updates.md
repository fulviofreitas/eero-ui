# Dependency Updates

This project uses **Renovate** with a **GitHub App** for automated dependency management.

## Overview

The dependency update system automatically:
- Tracks new releases of `eero-client` (the core API client)
- Creates PRs **immediately** when dependencies have updates available
- Auto-merges minor/patch updates for non-critical dependencies
- Requires manual review for `eero-client` and major updates
- Triggers instantly when `eero-client` releases a new version

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     IMMEDIATE DEPENDENCY UPDATE FLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────┐                                             │
│  │  fulviofreitas/eero-client │                                             │
│  │  ──────────────────────    │                                             │
│  │  🚀 Release v1.2.0         │                                             │
│  └────────────┬───────────────┘                                             │
│               │                                                              │
│               │ repository_dispatch (automatic)                              │
│               │ event: "eero-client-release"                                │
│               ▼                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       fulviofreitas/eero-ui                            │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │                                                                        │  │
│  │  ┌─────────────────────┐     ┌─────────────────────────────────────┐  │  │
│  │  │ 🔄 Renovate Workflow │◀────│ Triggers:                          │  │  │
│  │  │                     │     │  • repository_dispatch (immediate) │  │  │
│  │  │  GitHub App Auth    │     │  • schedule (weekly backup)        │  │  │
│  │  │  (eero-renovate-bot)│     │  • workflow_dispatch (manual)      │  │  │
│  │  └──────────┬──────────┘     └─────────────────────────────────────┘  │  │
│  │             │                                                          │  │
│  │             │ Creates PR immediately (no schedule wait)                │  │
│  │             ▼                                                          │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  PR: deps(critical): update eero-client v1.2.0                  │  │  │
│  │  │  ──────────────────────────────────────────                     │  │  │
│  │  │  Labels: [critical] [needs-review] [eero-client]                │  │  │
│  │  │  Reviewers: @fulviofreitas                                      │  │  │
│  │  │  Assignees: @fulviofreitas                                      │  │  │
│  │  └──────────┬──────────────────────────────────────────────────────┘  │  │
│  │             │                                                          │  │
│  │             │ PR triggers CI automatically                             │  │
│  │             ▼                                                          │  │
│  │  ┌─────────────────────┐                                               │  │
│  │  │ 🧪 CI Pipeline      │  Tests with new eero-client version          │  │
│  │  │  ✅ Pass → Review   │                                               │  │
│  │  │  ❌ Fail → Fix      │                                               │  │
│  │  └─────────────────────┘                                               │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

### Immediate PR Creation

PRs are created **immediately** when Renovate detects updates. This is achieved by setting `"schedule": ["at any time"]` in the config, which overrides any default schedule from presets.

- When `eero-client` releases, a PR is created within minutes
- The workflow itself runs weekly (backup) or on-demand
- Cross-repo dispatch from `eero-client` triggers instant updates

> **Note:** Without the explicit `"schedule": ["at any time"]`, the `config:recommended` preset applies a default schedule that would cause updates to show "Awaiting Schedule" in the Dependency Dashboard.

### Cross-Repository Notification

The `eero-client` repository is configured to notify `eero-ui` when a new release is published. This happens automatically via GitHub's `repository_dispatch` event.

**Flow:**
1. `eero-client` releases v1.2.0
2. Release workflow sends `repository_dispatch` to `eero-ui`
3. `eero-ui`'s Renovate workflow triggers immediately
4. Renovate creates a PR to update the dependency
5. CI runs tests against the new version

---

## Configuration

### Renovate Config (`.github/renovate.json5`)

Key features:
- **Immediate PR creation**: `"schedule": ["at any time"]` bypasses default preset schedules
- **Custom regex manager**: Tracks git URL dependencies with version tags
- **Semantic commits**: All PRs use conventional commit format
- **Auto-merge rules**: Minor/patch updates auto-merge after CI passes
- **eero-client special handling**: Never auto-merges, always requires review

### GitHub App

The `eero-renovate-bot` GitHub App provides:
- Higher rate limits than PATs (15,000 req/hour)
- Scoped permissions (only what's needed)
- No expiration issues
- Clear audit trail

**Required secrets:**
- `RENOVATE_APP_ID`: The GitHub App's numeric ID
- `RENOVATE_APP_PRIVATE_KEY`: The App's private key (PEM format)

---

## Workflow Triggers

The Renovate workflow (`.github/workflows/renovate.yml`) can be triggered by:

| Trigger | When | Result |
|---------|------|--------|
| `repository_dispatch` | eero-client releases | Immediate PR creation |
| `schedule` | Weekly (Mondays 3 AM UTC) | Checks all dependencies |
| `workflow_dispatch` | Manual run | On-demand check |

---

## Manual Trigger

To run Renovate manually:

1. Go to **Actions** → **🔄 Renovate**
2. Click **Run workflow**
3. Options:
   - **Dry-run mode**: Preview changes without creating PRs
   - **Log level**: Set to `debug` for troubleshooting
   - **Reset cache**: Clear cached data for fresh run

---

## Dependency Dashboard

Renovate creates a **Dependency Dashboard** issue that shows:
- All detected dependencies
- Pending updates
- Config warnings
- Manual override checkboxes

**Location:** [Issue #5 - 📦 Dependency Dashboard](https://github.com/fulviofreitas/eero-ui/issues/5)

You can force-create any PR by checking its checkbox in the dashboard.

---

## Performance: Repository Caching

The Renovate workflow includes repository caching for faster subsequent runs.

### How Caching Works

1. After each run, Renovate's cache is compressed and uploaded as an artifact
2. On the next run, the cache is downloaded and restored
3. This speeds up runs by preserving changelogs, metadata, and scan results

### Cache Management

- **Retention**: 7 days
- **Reset cache**: Use the "Reset repository cache" option in manual workflow dispatch
- **Cache key**: `renovate-cache-v1` (bump version in workflow to bust cache)

---

## Notifications & Reviews

### eero-client Updates

When Renovate detects a new eero-client version:

1. **Commit Message**: `deps(critical): update eero-client v1.2.0`
2. **Labels**: `critical`, `needs-review`, `eero-client`, `dependencies`
3. **Reviewers**: Automatically assigned to maintainers
4. **Assignees**: Automatically assigned for accountability
5. **PR Body**: Includes review checklist and relevant links

### PR Body Content

```markdown
## ⚠️ Critical Dependency Update

This PR updates `eero-client`, the core API client for eero network communication.

### Review Checklist
- [ ] Review the changelog for breaking changes
- [ ] Verify API compatibility
- [ ] Run full test suite locally if needed
- [ ] Check for any deprecated methods

### Links
- [eero-client Repository](https://github.com/fulviofreitas/eero-client)
- [eero-client Releases](https://github.com/fulviofreitas/eero-client/releases)
```

### Major Updates

All major version updates (any dependency):
- Labeled with `major-update`, `needs-review`
- Automatically request review from maintainers
- Never auto-merged

---

## eero-client Configuration

The `eero-client` repository has been configured to notify `eero-ui` on releases.

### How It Works

In `eero-client/.github/workflows/release.yml`, a `notify-downstream` job:

```yaml
notify-downstream:
  name: 🔔 Notify eero-ui
  needs: release
  if: needs.release.outputs.released == 'true'

  steps:
    - uses: peter-evans/repository-dispatch@v3
      with:
        token: ${{ secrets.EERO_UI_DISPATCH_TOKEN }}
        repository: fulviofreitas/eero-ui
        event-type: eero-client-release
        client-payload: |
          {
            "version": "${{ needs.release.outputs.version }}",
            "tag": "v${{ needs.release.outputs.version }}"
          }
```

### Required Secret

`eero-client` needs the `EERO_UI_DISPATCH_TOKEN` secret:
- A PAT with `repo` scope for `fulviofreitas/eero-ui`
- Or use the same GitHub App installed on both repos

---

## Troubleshooting

### Renovate not detecting eero-client updates

1. Check that the dependency is pinned with a version tag:
   ```
   eero-client @ git+https://github.com/fulviofreitas/eero-client.git@v1.0.1
   ```

2. Verify the regex pattern matches by running Renovate in debug mode
3. Check the Dependency Dashboard issue for any errors

### PRs not being created

1. Check the Dependency Dashboard for "Awaiting Schedule" - this shouldn't happen now
2. Verify the GitHub App has proper permissions
3. Run Renovate manually with debug logging

### GitHub App token errors

1. Ensure secrets `RENOVATE_APP_ID` and `RENOVATE_APP_PRIVATE_KEY` are set
2. Verify the App is installed on the repository
3. Check that the App has the required permissions:
   - Contents: Read and write
   - Issues: Read and write
   - Pull requests: Read and write
   - Workflows: Read and write

### Rate limiting

The GitHub App should have 15,000 requests/hour. If you hit limits:
- Reduce `prHourlyLimit` in renovate.json5
- The current limit is 2 PRs/hour

### Cache issues

If Renovate behaves unexpectedly:
1. Run workflow with "Reset repository cache" enabled
2. Or manually delete the `renovate-cache-v1` artifact from Actions

### Cross-repo dispatch not working

1. Verify `EERO_UI_DISPATCH_TOKEN` is set in eero-client
2. Check the token has `repo` scope
3. Verify the `repository_dispatch` trigger is in eero-ui's workflow
