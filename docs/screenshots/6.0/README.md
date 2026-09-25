# eero-ui 6.0 — UI screenshots (plan § 10 R10)

Captured 2026-09-24 (re-shot 2026-09-25 at 43f9cce for the final a11y pass) with Python Playwright + Chromium against `npm run dev` with every `/api/**` call
intercepted and answered from fixtures derived from `frontend/tests/mocks/handlers.ts` (1 network, 3 eeros,
12 devices, 2 profiles, DNS, health, entitlements with `is_premium: true` and `experimental_writes: true` so every premium card and gated write control renders). No backend and no live eero were involved, so values are synthetic.

Naming: `<route>--<theme>--<viewport-width>.png`. `before--*` files were captured from `master` (2fad9ab) in a
temporary worktree using the same fixtures; everything else is `feat/eero-ui-6.0-revamp` (43f9cce).

Routes: `login`, `dashboard` (`/`), `devices`, `device-detail` (`/devices/dev-1`), `eeros`, `eero-detail`
(`/eeros/eero-1`), `profiles`, `profile-detail` (`/profiles/profile-1`), `network` (`/network/network-123`,
plus one file per tab: `network-overview`, `network-wi-fi-guest`, `network-dns`, `network-advanced`,
`network-diagnostics`), `topology`, `account` (`/account`). Extra states: `dashboard-empty-networks`, `devices-loading-skeleton`,
`mobile-sidebar-open`, `command-palette` (⌘K open with a query typed, 1440 only), `topology-node-selected`, `profile-rename-modal`, `device-block-confirm`, and the two
`bootstrap-*` captures taken at `domcontentloaded` to prove the first paint already has the stored theme.

## After (this branch)

| File | Size |
|---|---|
| `account--dark--1440.png` | 65 KB |
| `account--dark--390.png` | 40 KB |
| `account--light--1440.png` | 67 KB |
| `account--light--390.png` | 40 KB |
| `bootstrap-stored-dark-os-light--domcontentloaded.png` | 9 KB |
| `bootstrap-stored-light-os-dark--domcontentloaded.png` | 9 KB |
| `command-palette--dark--1440.png` | 86 KB |
| `command-palette--light--1440.png` | 87 KB |
| `dashboard--dark--1440.png` | 233 KB |
| `dashboard--dark--390.png` | 200 KB |
| `dashboard--light--1440.png` | 234 KB |
| `dashboard--light--390.png` | 193 KB |
| `dashboard-empty-networks--dark--1440.png` | 37 KB |
| `dashboard-empty-networks--light--1440.png` | 38 KB |
| `device-block-confirm--dark--1440.png` | 101 KB |
| `device-block-confirm--light--1440.png` | 104 KB |
| `device-detail--dark--1440.png` | 194 KB |
| `device-detail--dark--390.png` | 141 KB |
| `device-detail--light--1440.png` | 203 KB |
| `device-detail--light--390.png` | 142 KB |
| `devices--dark--1440.png` | 162 KB |
| `devices--dark--390.png` | 73 KB |
| `devices--light--1440.png` | 163 KB |
| `devices--light--390.png` | 74 KB |
| `devices-loading-skeleton--dark--1440.png` | 9 KB |
| `eero-detail--dark--1440.png` | 190 KB |
| `eero-detail--dark--390.png` | 147 KB |
| `eero-detail--light--1440.png` | 193 KB |
| `eero-detail--light--390.png` | 147 KB |
| `eeros--dark--1440.png` | 80 KB |
| `eeros--dark--390.png` | 54 KB |
| `eeros--light--1440.png` | 82 KB |
| `eeros--light--390.png` | 55 KB |
| `login--dark--1440.png` | 32 KB |
| `login--dark--390.png` | 23 KB |
| `login--light--1440.png` | 32 KB |
| `login--light--390.png` | 23 KB |
| `mobile-sidebar-open--dark--390.png` | 34 KB |
| `network--dark--1440.png` | 205 KB |
| `network--dark--390.png` | 145 KB |
| `network--light--1440.png` | 208 KB |
| `network--light--390.png` | 146 KB |
| `network-advanced--dark--1440.png` | 381 KB |
| `network-advanced--dark--390.png` | 264 KB |
| `network-advanced--light--1440.png` | 384 KB |
| `network-advanced--light--390.png` | 266 KB |
| `network-diagnostics--dark--1440.png` | 183 KB |
| `network-diagnostics--dark--390.png` | 126 KB |
| `network-diagnostics--light--1440.png` | 185 KB |
| `network-diagnostics--light--390.png` | 127 KB |
| `network-dns--dark--1440.png` | 108 KB |
| `network-dns--dark--390.png` | 76 KB |
| `network-dns--light--1440.png` | 109 KB |
| `network-dns--light--390.png` | 76 KB |
| `network-overview--dark--1440.png` | 183 KB |
| `network-overview--dark--390.png` | 145 KB |
| `network-overview--light--1440.png` | 186 KB |
| `network-overview--light--390.png` | 146 KB |
| `network-wi-fi-guest--dark--1440.png` | 64 KB |
| `network-wi-fi-guest--dark--390.png` | 39 KB |
| `network-wi-fi-guest--light--1440.png` | 65 KB |
| `network-wi-fi-guest--light--390.png` | 40 KB |
| `profile-detail--dark--1440.png` | 146 KB |
| `profile-detail--dark--390.png` | 111 KB |
| `profile-detail--light--1440.png` | 149 KB |
| `profile-detail--light--390.png` | 112 KB |
| `profile-rename-modal--dark--1440.png` | 62 KB |
| `profile-rename-modal--light--1440.png` | 62 KB |
| `profiles--dark--1440.png` | 51 KB |
| `profiles--dark--390.png` | 28 KB |
| `profiles--light--1440.png` | 53 KB |
| `profiles--light--390.png` | 29 KB |
| `topology--dark--1440.png` | 115 KB |
| `topology--dark--390.png` | 60 KB |
| `topology--light--1440.png` | 114 KB |
| `topology--light--390.png` | 60 KB |
| `topology-node-selected--dark--1440.png` | 128 KB |
| `topology-node-selected--light--1440.png` | 129 KB |

## Before (master, dark unless noted)

| File | Size |
|---|---|
| `before--dashboard--dark--1440.png` | 237 KB |
| `before--dashboard--dark--390.png` | 208 KB |
| `before--device-detail--dark--1440.png` | 166 KB |
| `before--device-detail--dark--390.png` | 119 KB |
| `before--devices--dark--1440.png` | 163 KB |
| `before--devices--dark--390.png` | 70 KB |
| `before--eero-detail--dark--1440.png` | 157 KB |
| `before--eero-detail--dark--390.png` | 118 KB |
| `before--eeros--dark--1440.png` | 83 KB |
| `before--eeros--dark--390.png` | 54 KB |
| `before--login--dark--1440.png` | 29 KB |
| `before--login--dark--390.png` | 21 KB |
| `before--network--dark--1440.png` | 301 KB |
| `before--network--dark--390.png` | 224 KB |
| `before--profile-detail--dark--1440.png` | 87 KB |
| `before--profile-detail--dark--390.png` | 60 KB |
| `before--profiles--dark--1440.png` | 53 KB |
| `before--profiles--dark--390.png` | 29 KB |
| `before--topology--dark--1440.png` | 139 KB |
| `before--topology--dark--390.png` | 63 KB |
| `before--topology--light--1440.png` | 139 KB |
