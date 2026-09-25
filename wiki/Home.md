# 🏠 Eero UI Wiki

Welcome to the **Eero UI** documentation! This wiki contains detailed guides for installation, configuration, development, and more.

## 📚 Documentation

| Page | Description |
|------|-------------|
| [[Installation]] | Docker & manual setup guides |
| [[Configuration]] | Environment variables & settings |
| [[Architecture]] | System design & data flow |
| [[Metrics]] | Built-in metrics, the metric contract, the optional exporter |
| [[API-Reference]] | REST API endpoints |
| [[Security]] | Security considerations & best practices |
| [[Development]] | Local dev setup & testing |
| [[CI-CD]] | GitHub Actions workflows |
| [[Troubleshooting]] | Common issues & fixes |
| [[Roadmap]] | Future plans & known issues |

## ✨ What 6.0 adds

eero-ui collects its own metrics (no exporter), runs on eero-api v8 and exposes every SDK read family: insights, data usage, events, channel utilisation, members and invites, backup internet, security/WAN and notifications. Writes fall into three classes — verified (always on), unverified (behind `EERO_DASHBOARD_EXPERIMENTAL_WRITES`) and account identity (additionally behind `EERO_DASHBOARD_ACCOUNT_IDENTITY_WRITES`); see [[Configuration#write-gates]] and [[Roadmap]]. The account page, `⌘K` command palette, `?` shortcuts help, URL-encoded device filters, bulk block and a virtualized device table (`@tanstack/svelte-virtual`, MIT) round out the UI; fonts are self-hosted (OFL). Screenshots of every route, before and after, are indexed in [`docs/screenshots/6.0/README.md`](https://github.com/fulviofreitas/eero-ui/blob/master/docs/screenshots/6.0/README.md).

**Keyboard shortcuts** (`frontend/src/lib/shortcuts.ts` is the single source of truth):

| Keys | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open the command palette |
| `?` | Show keyboard shortcuts |
| `Esc` | Close the open dialog or menu |

Shortcuts do not fire while focus is in an input, textarea or contenteditable element.

## 🔗 Quick Links

- 🐙 [GitHub Repository](https://github.com/fulviofreitas/eero-ui)
- 📦 [eero-api SDK](https://github.com/fulviofreitas/eero-api)
- 🐳 [Docker Image](https://ghcr.io/fulviofreitas/eero-ui)

---

*This wiki is auto-generated from the `wiki/` folder in the repository.*
