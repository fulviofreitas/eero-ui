# Dependency Updates

This project uses **Renovate** with a **GitHub App** for automated dependency management.

## Overview

The dependency update system automatically:
- Tracks new releases of `eero-client` (the core API client)
- Creates PRs when dependencies have updates available
- Auto-merges minor/patch updates for non-critical dependencies
- Requires manual review for `eero-client` and major updates

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     DEPENDENCY UPDATE FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────┐                                             │
│  │  fulviofreitas/eero-client │                                             │
│  │  ──────────────────────    │                                             │
│  │  🚀 Release v1.0.2         │                                             │
│  └────────────┬───────────────┘                                             │
│               │                                                              │
│               │ repository_dispatch                                          │
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
│  │             │ Detects new tag v1.0.2                                   │  │
│  │             ▼                                                          │  │
│  │  ┌─────────────────────┐                                               │  │
│  │  │ 📝 Creates PR:      │                                               │  │
│  │  │ "Update eero-client │                                               │  │
│  │  │  to v1.0.2"         │                                               │  │
│  │  └──────────┬──────────┘                                               │  │
│  │             │                                                          │  │
│  │             │ PR triggers CI                                           │  │
│  │             ▼                                                          │  │
│  │  ┌─────────────────────┐                                               │  │
│  │  │ 🧪 CI Pipeline      │  Tests with new eero-client version          │  │
│  │  │  ✅ Pass → Merge    │                                               │  │
│  │  │  ❌ Fail → Review   │                                               │  │
│  │  └─────────────────────┘                                               │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Configuration

### Renovate Config (`.github/renovate.json5`)

Key features:
- **Custom regex manager**: Tracks git URL dependencies with version tags
- **Semantic commits**: All PRs use conventional commit format
- **Auto-merge rules**: Minor/patch updates auto-merge after CI passes
- **eero-client special handling**: Never auto-merges, always requires review

### GitHub App

The `eero-renovate-bot` GitHub App provides:
- Higher rate limits than PATs
- Scoped permissions (only what's needed)
- No expiration issues
- Clear audit trail

**Required secrets:**
- `RENOVATE_APP_ID`: The GitHub App's numeric ID
- `RENOVATE_APP_PRIVATE_KEY`: The App's private key (PEM format)

## Manual Trigger

To run Renovate manually:

1. Go to **Actions** → **🔄 Renovate**
2. Click **Run workflow**
3. Optionally enable dry-run mode to preview changes

## eero-client Release Notification

For immediate updates when eero-client releases, configure the eero-client repository to send a `repository_dispatch` event. See the section below.

---

## Setting Up eero-client Notifications

To enable immediate CI triggers when eero-client releases a new version, add this step to the eero-client release workflow:

### Option A: Using a Personal Access Token

Add to `eero-client/.github/workflows/release.yml`:

```yaml
- name: 🔔 Notify eero-ui of new release
  if: steps.release.outputs.new_release_published == 'true'
  uses: peter-evans/repository-dispatch@v3
  with:
    token: ${{ secrets.EERO_UI_DISPATCH_TOKEN }}
    repository: fulviofreitas/eero-ui
    event-type: eero-client-release
    client-payload: |
      {
        "version": "${{ steps.release.outputs.new_release_version }}",
        "tag": "v${{ steps.release.outputs.new_release_version }}"
      }
```

**Required secret in eero-client:**
- `EERO_UI_DISPATCH_TOKEN`: A PAT with `repo` scope for the eero-ui repository

### Option B: Using the GitHub App (Recommended)

If you install the same `eero-renovate-bot` GitHub App on the eero-client repository:

```yaml
- name: 🔑 Generate GitHub App token
  id: app-token
  uses: actions/create-github-app-token@v1
  with:
    app-id: ${{ secrets.RENOVATE_APP_ID }}
    private-key: ${{ secrets.RENOVATE_APP_PRIVATE_KEY }}
    repositories: eero-ui

- name: 🔔 Notify eero-ui of new release
  if: steps.release.outputs.new_release_published == 'true'
  uses: peter-evans/repository-dispatch@v3
  with:
    token: ${{ steps.app-token.outputs.token }}
    repository: fulviofreitas/eero-ui
    event-type: eero-client-release
    client-payload: |
      {
        "version": "${{ steps.release.outputs.new_release_version }}",
        "tag": "v${{ steps.release.outputs.new_release_version }}"
      }
```

This approach uses the same GitHub App, avoiding the need for additional PATs.

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

1. **PR Title**: Prefixed with `🔴 deps(critical):` for visibility
2. **Labels**: `critical`, `needs-review`, `eero-client`
3. **Reviewers**: Automatically assigned to maintainers
4. **Assignees**: Automatically assigned for accountability
5. **PR Body**: Includes review checklist and relevant links

### Major Updates

All major version updates (any dependency):
- Labeled with `major-update`, `needs-review`
- Automatically request review from maintainers
- Never auto-merged

---

## Troubleshooting

### Renovate not detecting eero-client updates

1. Check that the dependency is pinned with a version tag:
   ```
   eero-client @ git+https://github.com/fulviofreitas/eero-client.git@v1.0.1
   ```

2. Verify the regex pattern matches by running Renovate in debug mode
3. Check the Dependency Dashboard issue for any errors

### GitHub App token errors

1. Ensure secrets `RENOVATE_APP_ID` and `RENOVATE_APP_PRIVATE_KEY` are set
2. Verify the App is installed on the repository
3. Check that the App has the required permissions

### Rate limiting

The GitHub App should have 15,000 requests/hour. If you hit limits:
- Reduce `prHourlyLimit` in renovate.json5
- Increase the schedule interval

### Cache issues

If Renovate behaves unexpectedly:
1. Run workflow with "Reset repository cache" enabled
2. Or manually delete the `renovate-cache-v1` artifact from Actions
