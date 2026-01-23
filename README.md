# 🛜 Eero UI Dashboard

A sleek **Svelte** dashboard for managing your Eero mesh network. Built for operators who want fast, efficient network control.

[![CI](https://github.com/fulviofreitas/eero-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/fulviofreitas/eero-ui/actions)
[![Docker](https://ghcr-badge.egpl.dev/fulviofreitas/eero-ui/latest_tag?color=blue&label=docker)](https://ghcr.io/fulviofreitas/eero-ui)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<p align="center">
  <img src="https://img.shields.io/badge/Svelte-FF3E00?logo=svelte&logoColor=white" alt="Svelte">
  <img src="https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker">
</p>

---

## ✨ Features

| 📊 Monitor | 🎛️ Control | 🎨 Experience |
|-----------|-----------|--------------|
| Network health & speed tests | Block/unblock devices | Dark theme dashboard |
| Device listing & search | Pause/unpause profiles | Real-time filtering |
| Eero node status | Reboot nodes | Optimistic UI updates |

---

## 🚀 Quick Start

```bash
# Pull and run
docker run -d --name eero-ui -p 8000:8000 \
  -v eero-data:/data \
  -e EERO_DASHBOARD_SESSION_SECRET=$(openssl rand -hex 32) \
  ghcr.io/fulviofreitas/eero-ui:latest
```

Open **http://localhost:8000** 🎉

> 💡 Or clone & run locally: `./start.sh`

---

## 📚 Documentation

Full documentation lives in the **[Wiki](../../wiki)**:

| 📖 Guide | Description |
|----------|-------------|
| [🚀 Installation](../../wiki/Installation) | Docker & manual setup |
| [⚙️ Configuration](../../wiki/Configuration) | Environment variables |
| [🏗️ Architecture](../../wiki/Architecture) | System design & auth flow |
| [📡 API Reference](../../wiki/API-Reference) | REST endpoints |
| [🔒 Security](../../wiki/Security) | Best practices |
| [🛠️ Development](../../wiki/Development) | Local dev & testing |
| [🔄 CI/CD](../../wiki/CI-CD) | GitHub Actions workflows |
| [🔧 Troubleshooting](../../wiki/Troubleshooting) | Common issues |
| [🗺️ Roadmap](../../wiki/Roadmap) | Future plans |

---

## 🔗 Related

- **[eero-api](https://github.com/fulviofreitas/eero-api)** — Async Python SDK for Eero API

---

## 📄 License

[MIT](LICENSE) — Use freely, contribute gladly!

---

<div align="center">

## 📊 Repository Metrics

![Repository Metrics](./metrics.repository.svg)

</div>
