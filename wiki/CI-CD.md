# 🔄 CI/CD Pipeline

This project uses chained GitHub Actions workflows:

```
🧪 CI Pipeline  ──→  🚀 Release  ──→  🐳 Docker Build
    (tests)        (semantic)       (multi-platform)
```

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| **CI Pipeline** | Push/PR | Runs commit lint, backend tests, frontend tests, security scan |
| **Release** | After CI passes | Creates GitHub releases using semantic-release |
| **Docker Build** | On version tags | Builds and pushes images to `ghcr.io` |
| **Sync Wiki** | Push to `wiki/` | Auto-updates GitHub Wiki |

## Conventional Commits

Use [Conventional Commits](https://conventionalcommits.org) to trigger automatic releases:

| Commit Type | Example | Version Bump |
|-------------|---------|--------------|
| `feat:` | `feat: add device filtering` | Minor (1.x.0) |
| `fix:` | `fix: handle empty device list` | Patch (1.0.x) |
| `feat!:` | `feat!: redesign API` | Major (x.0.0) |

## Docker Image

Images are published to:

```
ghcr.io/fulviofreitas/eero-ui:latest
ghcr.io/fulviofreitas/eero-ui:<version>
```

Multi-platform support: `linux/amd64`, `linux/arm64`
