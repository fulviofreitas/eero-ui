<div align="center">

# 🖥️ Eero UI

**A sleek dashboard for managing your Eero mesh network**

[![Svelte](https://img.shields.io/badge/svelte-5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev)
[![FastAPI](https://img.shields.io/badge/fastapi-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Docker](https://img.shields.io/badge/docker-ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://ghcr.io/fulviofreitas/eero-ui)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)](LICENSE)

---

_A modern, responsive web dashboard for Eero network management._  
_Built for operators who want fast, efficient network control._

[Get Started](#-quick-start) · [Documentation](#-documentation) · [Features](#-features) · [License](#-license)

</div>

---

## 📸 Screenshots

| Dark Theme | Light Theme |
|:----------:|:-----------:|
| ![Dashboard Dark](./screenshots/dashboard.png) | ![Dashboard Light](./screenshots/dashboard-light.png) |

| Devices | Eeros | Profiles |
|:-------:|:-----:|:--------:|
| ![Devices](./screenshots/devices.png) | ![Eeros](./screenshots/eeros.png) | ![Profiles](./screenshots/profiles.png) |

| Topology | Network | Login |
|:--------:|:-------:|:-----:|
| ![Topology](./screenshots/topology.png) | ![Network](./screenshots/network.png) | ![Login](./screenshots/login.png) |

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
