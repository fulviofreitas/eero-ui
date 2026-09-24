# eero-ui 6.0 — UI screenshots (plan § 10 R10)

Captured 2026-09-24 with Python Playwright + Chromium against `npm run dev` with every `/api/**` call
intercepted and answered from fixtures derived from `frontend/tests/mocks/handlers.ts` (1 network, 3 eeros,
12 devices, 2 profiles, DNS, health). No backend and no live eero were involved, so values are synthetic.

Naming: `<route>--<theme>--<viewport-width>.png`. `before--*` files were captured from `master` (2fad9ab) in a
temporary worktree using the same fixtures; everything else is `feat/eero-ui-6.0-revamp` (3eb1f83).

Routes: `login`, `dashboard` (`/`), `devices`, `device-detail` (`/devices/dev-1`), `eeros`, `eero-detail`
(`/eeros/eero-1`), `profiles`, `profile-detail` (`/profiles/profile-1`), `network` (`/network/network-123`,
plus one file per tab: `network-overview`, `network-wi-fi-guest`, `network-dns`, `network-advanced`,
`network-diagnostics`), `topology`. Extra states: `dashboard-empty-networks`, `devices-loading-skeleton`,
`mobile-sidebar-open`, `topology-node-selected`, `profile-rename-modal`, `device-block-confirm`, and the two
`bootstrap-*` captures taken at `domcontentloaded` to prove the first paint already has the stored theme.

## After (this branch)

| File | Size |
|---|---|
| `bootstrap-stored-dark-os-light--domcontentloaded.png` | 8 KB |
| `bootstrap-stored-light-os-dark--domcontentloaded.png` | 8 KB |
| `dashboard--dark--1440.png` | 289 KB |
| `dashboard--dark--390.png` | 200 KB |
| `dashboard--light--1440.png` | 235 KB |
| `dashboard--light--390.png` | 192 KB |
| `dashboard-empty-networks--dark--1440.png` | 37 KB |
| `dashboard-empty-networks--light--1440.png` | 37 KB |
| `device-block-confirm--dark--1440.png` | 98 KB |
| `device-block-confirm--light--1440.png` | 101 KB |
| `device-detail--dark--1440.png` | 157 KB |
| `device-detail--dark--390.png` | 112 KB |
| `device-detail--light--1440.png` | 158 KB |
| `device-detail--light--390.png` | 112 KB |
| `devices--dark--1440.png` | 161 KB |
| `devices--dark--390.png` | 65 KB |
| `devices--light--1440.png` | 163 KB |
| `devices--light--390.png` | 66 KB |
| `devices-loading-skeleton--dark--1440.png` | 64 KB |
| `eero-detail--dark--1440.png` | 154 KB |
| `eero-detail--dark--390.png` | 117 KB |
| `eero-detail--light--1440.png` | 156 KB |
| `eero-detail--light--390.png` | 118 KB |
| `eeros--dark--1440.png` | 81 KB |
| `eeros--dark--390.png` | 54 KB |
| `eeros--light--1440.png` | 82 KB |
| `eeros--light--390.png` | 55 KB |
| `login--dark--1440.png` | 29 KB |
| `login--dark--390.png` | 21 KB |
| `login--light--1440.png` | 30 KB |
| `login--light--390.png` | 21 KB |
| `mobile-sidebar-open--dark--390.png` | 29 KB |
| `network--dark--1440.png` | 122 KB |
| `network--dark--390.png` | 91 KB |
| `network--light--1440.png` | 123 KB |
| `network--light--390.png` | 92 KB |
| `network-advanced--dark--1440.png` | 62 KB |
| `network-advanced--dark--390.png` | 36 KB |
| `network-advanced--light--1440.png` | 63 KB |
| `network-advanced--light--390.png` | 36 KB |
| `network-diagnostics--dark--1440.png` | 108 KB |
| `network-diagnostics--dark--390.png` | 71 KB |
| `network-diagnostics--light--1440.png` | 109 KB |
| `network-diagnostics--light--390.png` | 72 KB |
| `network-dns--dark--1440.png` | 90 KB |
| `network-dns--dark--390.png` | 62 KB |
| `network-dns--light--1440.png` | 91 KB |
| `network-dns--light--390.png` | 63 KB |
| `network-overview--dark--1440.png` | 122 KB |
| `network-overview--dark--390.png` | 91 KB |
| `network-overview--light--1440.png` | 123 KB |
| `network-overview--light--390.png` | 92 KB |
| `network-wi-fi-guest--dark--1440.png` | 53 KB |
| `network-wi-fi-guest--dark--390.png` | 30 KB |
| `network-wi-fi-guest--light--1440.png` | 54 KB |
| `network-wi-fi-guest--light--390.png` | 30 KB |
| `profile-detail--dark--1440.png` | 80 KB |
| `profile-detail--dark--390.png` | 56 KB |
| `profile-detail--light--1440.png` | 82 KB |
| `profile-detail--light--390.png` | 57 KB |
| `profile-rename-modal--dark--1440.png` | 62 KB |
| `profile-rename-modal--light--1440.png` | 61 KB |
| `profiles--dark--1440.png` | 52 KB |
| `profiles--dark--390.png` | 28 KB |
| `profiles--light--1440.png` | 53 KB |
| `profiles--light--390.png` | 29 KB |
| `topology--dark--1440.png` | 136 KB |
| `topology--dark--390.png` | 61 KB |
| `topology--light--1440.png` | 134 KB |
| `topology--light--390.png` | 61 KB |
| `topology-node-selected--dark--1440.png` | 144 KB |
| `topology-node-selected--light--1440.png` | 143 KB |

## Before (master, dark unless noted)

| File | Size |
|---|---|
| `before--dashboard--dark--1440.png` | 237 KB |
| `before--dashboard--dark--390.png` | 207 KB |
| `before--device-detail--dark--1440.png` | 166 KB |
| `before--device-detail--dark--390.png` | 119 KB |
| `before--devices--dark--1440.png` | 162 KB |
| `before--devices--dark--390.png` | 69 KB |
| `before--eero-detail--dark--1440.png` | 156 KB |
| `before--eero-detail--dark--390.png` | 118 KB |
| `before--eeros--dark--1440.png` | 82 KB |
| `before--eeros--dark--390.png` | 54 KB |
| `before--login--dark--1440.png` | 28 KB |
| `before--login--dark--390.png` | 20 KB |
| `before--network--dark--1440.png` | 300 KB |
| `before--network--dark--390.png` | 223 KB |
| `before--profile-detail--dark--1440.png` | 86 KB |
| `before--profile-detail--dark--390.png` | 59 KB |
| `before--profiles--dark--1440.png` | 53 KB |
| `before--profiles--dark--390.png` | 28 KB |
| `before--topology--dark--1440.png` | 139 KB |
| `before--topology--dark--390.png` | 63 KB |
| `before--topology--light--1440.png` | 139 KB |
