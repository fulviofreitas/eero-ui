# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [4.2.1](https://github.com/fulviofreitas/eero-ui/compare/v4.2.0...v4.2.1) (2026-01-24)

### 🐛 Bug Fixes

* **status:** normalize API status values for consistent frontend display ([8fa9ca4](https://github.com/fulviofreitas/eero-ui/commit/8fa9ca4cf9e83d9c1e2b0e915b56faeadef44a3b))

## [4.2.0](https://github.com/fulviofreitas/eero-ui/compare/v4.1.1...v4.2.0) (2026-01-24)

### ✨ Features

* **deps:** update eero packages to 3.9.0 ([e6941fe](https://github.com/fulviofreitas/eero-ui/commit/e6941fefabac77be3cf95d9655215f3a4c4654f3))

## [4.1.1](https://github.com/fulviofreitas/eero-ui/compare/v4.1.0...v4.1.1) (2026-01-24)

### 🐛 Bug Fixes

* **transformers:** align extract_list with real eero-api response format ([108bb6d](https://github.com/fulviofreitas/eero-ui/commit/108bb6d0d075c23a49bd97792a92f0649af49345))

## [4.1.0](https://github.com/fulviofreitas/eero-ui/compare/v4.0.4...v4.1.0) (2026-01-24)

### ✨ Features

* **deps:** update eero packages to compatible versions ([6f38359](https://github.com/fulviofreitas/eero-ui/commit/6f383590f5e8b9e36c27e9ad397b4a4242e3ed7f))
* **deps:** update eero-api to 2.1.3 ([e6476f3](https://github.com/fulviofreitas/eero-ui/commit/e6476f369d7e5e1b687ba6f449bcdee1b6edfd35))
* **deps:** update eero-prometheus-exporter to 3.1.1 ([956689d](https://github.com/fulviofreitas/eero-ui/commit/956689dd8907d7d8ca95efe28f1326679a669d21))
* **deps:** update eero-prometheus-exporter to 3.8.0 ([#62](https://github.com/fulviofreitas/eero-ui/issues/62)) ([6c2c400](https://github.com/fulviofreitas/eero-ui/commit/6c2c40026d5b9b9fe66079147338791de884df1f))

### 🐛 Bug Fixes

* **renovate:** group eero packages to resolve dependency conflicts ([3b19fcf](https://github.com/fulviofreitas/eero-ui/commit/3b19fcfe83b6a36c7a91292326a92b1b49fb987e))

## [4.0.4](https://github.com/fulviofreitas/eero-ui/compare/v4.0.3...v4.0.4) (2026-01-23)

### 🐛 Bug Fixes

* **renovate:** disable uv.lock updates due to Renovate limitation ([0f4d11b](https://github.com/fulviofreitas/eero-ui/commit/0f4d11b1ea635f3203cad9d39da1cb6c089ecad2))

## [4.0.3](https://github.com/fulviofreitas/eero-ui/compare/v4.0.2...v4.0.3) (2026-01-23)

### 🐛 Bug Fixes

* **renovate:** migrate from deprecated prTitle to commitMessage ([d4e16bc](https://github.com/fulviofreitas/eero-ui/commit/d4e16bc49c1351a33998d97f9e27917ae9bdddcb))

## [4.0.2](https://github.com/fulviofreitas/eero-ui/compare/v4.0.1...v4.0.2) (2026-01-23)

### 🐛 Bug Fixes

* **renovate:** separate eero-api and eero-prometheus-exporter rules ([47c9538](https://github.com/fulviofreitas/eero-ui/commit/47c95382c821083fba8dd5e13f94ab892fc8bab9))

## [4.0.1](https://github.com/fulviofreitas/eero-ui/compare/v4.0.0...v4.0.1) (2026-01-23)

### 🐛 Bug Fixes

* **renovate:** disable automerge for eero packages, require review ([0c12cca](https://github.com/fulviofreitas/eero-ui/commit/0c12cca0ffecb2ba12b45bcd06e6633e640df98c))

## [4.0.0](https://github.com/fulviofreitas/eero-ui/compare/v3.14.0...v4.0.0) (2026-01-23)

### ⚠ BREAKING CHANGES

* migrate to eero-api v2.0.0 raw response architecture

### ✨ Features

* **ci:** standardize renovate workflow with reusable actions ([2179f94](https://github.com/fulviofreitas/eero-ui/commit/2179f94e47abd29ac1c62cd274cc02e26915880d))
* **deps:** update eero-packages ([#59](https://github.com/fulviofreitas/eero-ui/issues/59)) ([3a2ee86](https://github.com/fulviofreitas/eero-ui/commit/3a2ee862ad3316e9c793f938b7e0dee89e8f1ca1))
* migrate to eero-api v2.0.0 raw response architecture ([d5cd5fc](https://github.com/fulviofreitas/eero-ui/commit/d5cd5fc657c97e196cd965d3fefd131a98176817))
* **renovate:** treat eero packages as feature releases for minor version bumps ([4356e0c](https://github.com/fulviofreitas/eero-ui/commit/4356e0c76d9601c5ef3ca79d402c44e3385785dd))

### 🐛 Bug Fixes

* **renovate:** enable pep621 manager for backend Python deps ([aca89d5](https://github.com/fulviofreitas/eero-ui/commit/aca89d5d37ae5840ab6dd1b5305919fba92dfb4f))
* **renovate:** ensure consistent config matching all Python managers ([bb4d337](https://github.com/fulviofreitas/eero-ui/commit/bb4d337e334890a1df953f5d95c9c0d099ab3780))
* **renovate:** exclude eero packages from major-update rule ([d77bc57](https://github.com/fulviofreitas/eero-ui/commit/d77bc57ec309aff0052ddeeb7f430c5958b2347e))
* **renovate:** group eero-api and eero-prometheus-exporter together ([25d4e08](https://github.com/fulviofreitas/eero-ui/commit/25d4e0891e40709ef7fe946d321120893ca6ebdb))
* **renovate:** move eero-packages rule to end for precedence ([ea28fe0](https://github.com/fulviofreitas/eero-ui/commit/ea28fe028982c54b6d4a203b8e8a9a673b91ba08))
* **renovate:** restore critical and needs-review labels for eero packages ([6f4b208](https://github.com/fulviofreitas/eero-ui/commit/6f4b20875d71712442a3956ca655ea564f294810))

## [3.14.0](https://github.com/fulviofreitas/eero-ui/compare/v3.13.0...v3.14.0) (2026-01-22)

### ✨ Features

* **dashboard:** add wireless and wired counts to connected clients chart ([f2065e8](https://github.com/fulviofreitas/eero-ui/commit/f2065e814907941070f6c114178d605b6d3694ee))

## [3.13.0](https://github.com/fulviofreitas/eero-ui/compare/v3.12.4...v3.13.0) (2026-01-22)

### ✨ Features

* **dashboard:** add side-by-side speedtest layout and device insights ([774a203](https://github.com/fulviofreitas/eero-ui/commit/774a203ed5f54b95d92e4c92413fc4af0de3c866))

## [3.12.4](https://github.com/fulviofreitas/eero-ui/compare/v3.12.3...v3.12.4) (2026-01-22)

### 🐛 Bug Fixes

* **charts:** clone datasets to avoid Svelte 5 reactivity conflict ([56a89d2](https://github.com/fulviofreitas/eero-ui/commit/56a89d22cc1c4754fba38e94600d3200d0c1a4af))

## [3.12.3](https://github.com/fulviofreitas/eero-ui/compare/v3.12.2...v3.12.3) (2026-01-22)

### 🐛 Bug Fixes

* **charts:** register LineController for Chart.js ([af4bfb3](https://github.com/fulviofreitas/eero-ui/commit/af4bfb31b64b2f8ce5b6eca8e4b6d71e9b93d42f))

## [3.12.2](https://github.com/fulviofreitas/eero-ui/compare/v3.12.1...v3.12.2) (2026-01-22)

### 🐛 Bug Fixes

* **charts:** use Svelte action for chart initialization ([8a74099](https://github.com/fulviofreitas/eero-ui/commit/8a7409913c0a1db62e382ecb4fef67dc367c1273))

## [3.12.1](https://github.com/fulviofreitas/eero-ui/compare/v3.12.0...v3.12.1) (2026-01-22)

### 🐛 Bug Fixes

* **deps:** enable Renovate tracking for eero-prometheus-exporter ([e251b6f](https://github.com/fulviofreitas/eero-ui/commit/e251b6f88269ee8ebe6ae10ae3c8c718ddbeacb3))

## [3.12.0](https://github.com/fulviofreitas/eero-ui/compare/v3.11.1...v3.12.0) (2026-01-22)

### ✨ Features

* **topology:** enable grouped dragging of devices with parent eero ([019b31f](https://github.com/fulviofreitas/eero-ui/commit/019b31ff57482ef145c75da32dfa9951240bbe60))

## [3.11.1](https://github.com/fulviofreitas/eero-ui/compare/v3.11.0...v3.11.1) (2026-01-22)

### 🐛 Bug Fixes

* **charts:** create chart when canvas becomes available ([18f0054](https://github.com/fulviofreitas/eero-ui/commit/18f0054ab48b737dfdf0ee8cf9bfff3940b484c0))

## [3.11.0](https://github.com/fulviofreitas/eero-ui/compare/v3.10.1...v3.11.0) (2026-01-22)

### ✨ Features

* **ui:** move Topology to last nav position and add speedtest chart to Dashboard ([90a580c](https://github.com/fulviofreitas/eero-ui/commit/90a580c4ed4930966992b1d8382ae80afda2f9f8))

## [3.10.1](https://github.com/fulviofreitas/eero-ui/compare/v3.10.0...v3.10.1) (2026-01-22)

### 🐛 Bug Fixes

* **ui:** reorder footer versions and rename exporter label ([4e81693](https://github.com/fulviofreitas/eero-ui/commit/4e81693ec81d2f3032f9177d3e76eeb9648f6752))

## [3.10.0](https://github.com/fulviofreitas/eero-ui/compare/v3.9.1...v3.10.0) (2026-01-22)

### ✨ Features

* **ui:** add eero-prometheus-exporter version to sidebar footer ([6e9c7b6](https://github.com/fulviofreitas/eero-ui/commit/6e9c7b6dfd6bfc75762a63ada7db5a87976d15ee))

## [3.9.1](https://github.com/fulviofreitas/eero-ui/compare/v3.9.0...v3.9.1) (2026-01-22)

### 🐛 Bug Fixes

* **metrics:** correct speedtest metric names ([11c9a27](https://github.com/fulviofreitas/eero-ui/commit/11c9a2743e0a8e2a8f1d379b69b41793a1cb5d36))

## [3.9.0](https://github.com/fulviofreitas/eero-ui/compare/v3.8.2...v3.9.0) (2026-01-22)

### ✨ Features

* **ci:** accept eero-prometheus-exporter release notifications ([2a52b6b](https://github.com/fulviofreitas/eero-ui/commit/2a52b6baffbec19a1462ba888237ce8f8d3936a0))

## [3.8.2](https://github.com/fulviofreitas/eero-ui/compare/v3.8.1...v3.8.2) (2026-01-22)

### 🐛 Bug Fixes

* **deps:** pin eero-prometheus-exporter==2.3.1 and remove workaround ([2e74a23](https://github.com/fulviofreitas/eero-ui/commit/2e74a231b4f04756a08703826462b7bf792bdd6e)), closes [#19](https://github.com/fulviofreitas/eero-ui/issues/19)

## [3.8.1](https://github.com/fulviofreitas/eero-ui/compare/v3.8.0...v3.8.1) (2026-01-22)

### 🐛 Bug Fixes

* **container:** add symlink workaround for exporter session bug ([d80c4d3](https://github.com/fulviofreitas/eero-ui/commit/d80c4d312f73a9502c3d8c249e883cc530ec7552))

## [3.8.0](https://github.com/fulviofreitas/eero-ui/compare/v3.7.1...v3.8.0) (2026-01-22)

### ✨ Features

* **ui:** add custom logo and favicon ([fdd6353](https://github.com/fulviofreitas/eero-ui/commit/fdd635337a2c63650cc316fd9967ce989871824f))

## [3.7.1](https://github.com/fulviofreitas/eero-ui/compare/v3.7.0...v3.7.1) (2026-01-22)

### 🐛 Bug Fixes

* **topology:** adjust edge legend position to avoid overlapping controls ([dd88bf0](https://github.com/fulviofreitas/eero-ui/commit/dd88bf02aa9efc6f4c3890392081f824ba602315))

## [3.7.0](https://github.com/fulviofreitas/eero-ui/compare/v3.6.2...v3.7.0) (2026-01-22)

### ✨ Features

* **charts:** add Chart.js visualizations for metrics data ([b2c06d3](https://github.com/fulviofreitas/eero-ui/commit/b2c06d34cd48e5d864ba5219080cf4692900dcd5))

## [3.6.2](https://github.com/fulviofreitas/eero-ui/compare/v3.6.1...v3.6.2) (2026-01-22)

### 🐛 Bug Fixes

* **ui:** align theme toggle with network selector row ([0cf265d](https://github.com/fulviofreitas/eero-ui/commit/0cf265d207d3ab324ea06f5f86b2e1b81ccfe080))

## [3.6.1](https://github.com/fulviofreitas/eero-ui/compare/v3.6.0...v3.6.1) (2026-01-22)

### 🐛 Bug Fixes

* **auth:** copy session file instead of accessing non-existent user_token ([4ab236d](https://github.com/fulviofreitas/eero-ui/commit/4ab236d57ca36efc49d88d4e25fa8692300facb5))

## [3.6.0](https://github.com/fulviofreitas/eero-ui/compare/v3.5.0...v3.6.0) (2026-01-22)

### ✨ Features

* **metrics:** embed eero-prometheus-exporter and VictoriaMetrics ([c877bdb](https://github.com/fulviofreitas/eero-ui/commit/c877bdb6d0d6747b6bfb7784590bd3df657883cd))

## [3.5.0](https://github.com/fulviofreitas/eero-ui/compare/v3.4.0...v3.5.0) (2026-01-21)

### ✨ Features

* **ui:** add light/dark theme toggle ([5772b42](https://github.com/fulviofreitas/eero-ui/commit/5772b42ec7afa4db9177b08328ec40dbbbc30460))

## [3.4.0](https://github.com/fulviofreitas/eero-ui/compare/v3.3.0...v3.4.0) (2026-01-21)

### ✨ Features

* **ui:** add clickable links to version badges in sidebar footer ([dd19167](https://github.com/fulviofreitas/eero-ui/commit/dd19167a3ef031c78ecf1ee0bc1659c2639f6707))

## [3.3.0](https://github.com/fulviofreitas/eero-ui/compare/v3.2.0...v3.3.0) (2026-01-21)

### ✨ Features

* **topology:** enhance visualization with layout options and edge styling ([13d39d1](https://github.com/fulviofreitas/eero-ui/commit/13d39d1a388c86fb1df07c1ec2971391e63fcfed))

## [3.2.0](https://github.com/fulviofreitas/eero-ui/compare/v3.1.2...v3.2.0) (2026-01-21)

### ✨ Features

* **topology:** add interactive network topology visualization ([a350622](https://github.com/fulviofreitas/eero-ui/commit/a35062248ae4b918ed8b1c794e40d721b954d220))

## [3.1.2](https://github.com/fulviofreitas/eero-ui/compare/v3.1.1...v3.1.2) (2026-01-20)

### 🐛 Bug Fixes

* **ci:** add prTitle config for squash merge commitlint compliance ([a50a018](https://github.com/fulviofreitas/eero-ui/commit/a50a018effb1cc882bc6c56686502f40ed06e72b))

## [3.1.1](https://github.com/fulviofreitas/eero-ui/compare/v3.1.0...v3.1.1) (2026-01-20)

### 🐛 Bug Fixes

* **ci:** prevent commitlint body-max-line-length failures on Renovate PRs ([d0ed07c](https://github.com/fulviofreitas/eero-ui/commit/d0ed07cb86c42d5d6a5280d7b166f0a6018f5bb1))

## [3.1.0](https://github.com/fulviofreitas/eero-ui/compare/v3.0.7...v3.1.0) (2026-01-19)

### ✨ Features

* release v3.1.0 ([9eef216](https://github.com/fulviofreitas/eero-ui/commit/9eef2162282c092bf21c853db63bdc92aa9ee63a))

## [3.0.7](https://github.com/fulviofreitas/eero-ui/compare/v3.0.6...v3.0.7) (2026-01-19)

### 🐛 Bug Fixes

* **ci:** remove invalid workflows permission from auto-merge ([596f1aa](https://github.com/fulviofreitas/eero-ui/commit/596f1aa584cf5d01c5f6dbef020eca9838da98cb))

## [3.0.6](https://github.com/fulviofreitas/eero-ui/compare/v3.0.5...v3.0.6) (2026-01-18)

### 🐛 Bug Fixes

* **ci:** use GitHub App for auto-merge to support workflow file changes ([659a329](https://github.com/fulviofreitas/eero-ui/commit/659a32944eb6f0b524fce6d7949aeda0e6cbfe53))

## [3.0.5](https://github.com/fulviofreitas/eero-ui/compare/v3.0.4...v3.0.5) (2026-01-18)

### 🐛 Bug Fixes

* **ci:** correct Renovate config typo and update deprecated syntax ([ebecb69](https://github.com/fulviofreitas/eero-ui/commit/ebecb69d82c98c1d1d66dbb80a678af6aadac0f3))

## [3.0.4](https://github.com/fulviofreitas/eero-ui/compare/v3.0.3...v3.0.4) (2026-01-18)

### 🐛 Bug Fixes

* **ci:** improve Renovate labels and auto-merge blocking ([687eb9c](https://github.com/fulviofreitas/eero-ui/commit/687eb9c9a875049d56e0f43dae70ff28f64f42b2))

## [3.0.3](https://github.com/fulviofreitas/eero-ui/compare/v3.0.2...v3.0.3) (2026-01-18)

### 🐛 Bug Fixes

* **ci:** use head_ref for PR concurrency group ([2d5780c](https://github.com/fulviofreitas/eero-ui/commit/2d5780cf3d6d32d606fde8146a6ebc16907234ba))

### 📚 Documentation

* document disabled Svelte 5 eslint rules with migration guidance ([4b92d2f](https://github.com/fulviofreitas/eero-ui/commit/4b92d2f3fd5c482a60fc31576e05682bbe1a0642))

## [3.0.2](https://github.com/fulviofreitas/eero-ui/compare/v3.0.1...v3.0.2) (2026-01-17)

### 🐛 Bug Fixes

* disable new Svelte 5 eslint rules for gradual migration ([b1b9627](https://github.com/fulviofreitas/eero-ui/commit/b1b962785f76c9c7462d35b77dbc8a8abcf0cc8c))

## [3.0.1](https://github.com/fulviofreitas/eero-ui/compare/v3.0.0...v3.0.1) (2026-01-17)

### 🐛 Bug Fixes

* revert @sveltejs/vite-plugin-svelte to v3 for Svelte 4 compatibility ([3c8a015](https://github.com/fulviofreitas/eero-ui/commit/3c8a01578f52ed3293d8fbac6ee75667a25d8900))

## [3.0.0](https://github.com/fulviofreitas/eero-ui/compare/v2.4.0...v3.0.0) (2026-01-17)

### ⚠ BREAKING CHANGES

* Python 3.10 and 3.11 are no longer supported

- Update backend requires-python to >=3.12
- Update wiki installation docs

### ✨ Features

* **ci:** migrate workflows to use reusable actions from eero-api ([ddd13c1](https://github.com/fulviofreitas/eero-ui/commit/ddd13c1abfb143082a787f241cddac953f7e1c53))
* require Python 3.12 minimum ([ff758c5](https://github.com/fulviofreitas/eero-ui/commit/ff758c545ecdc83720ef0cf106d45170c42ec723))
* **security:** migrate from Opengrep to Semgrep ([b4b3ed3](https://github.com/fulviofreitas/eero-ui/commit/b4b3ed32f1123fceedacfd21fccd3a9759251ac9))

### 🐛 Bug Fixes

* add pretest script to run svelte-kit sync before tests ([240c2ed](https://github.com/fulviofreitas/eero-ui/commit/240c2eda06e284a2d40f8687cc93d71776b5de4b))
* **ci:** properly report security scan job status ([c3c42fb](https://github.com/fulviofreitas/eero-ui/commit/c3c42fb05ecee421758bd1eb55909efeab083fdb))
* **ci:** require ALL jobs to pass for CI Success ([1aaa250](https://github.com/fulviofreitas/eero-ui/commit/1aaa2503c2c04b450085b7400c212d107b2045cb))
* **ci:** use master branch consistently in all workflows ([26e3c6e](https://github.com/fulviofreitas/eero-ui/commit/26e3c6e226dc798624847deeb5b3b342808966ed))
* **ci:** use master branch only in triggers ([5c9bf00](https://github.com/fulviofreitas/eero-ui/commit/5c9bf00dacff288d27ab5f4dac8ffc0ed269e5fe))
* resolve python lint errors and add isort config ([03192f6](https://github.com/fulviofreitas/eero-ui/commit/03192f64a75c57c1c7e028f20e5ff7544d23a4b4))
* run svelte-kit sync before test:coverage ([572f5fc](https://github.com/fulviofreitas/eero-ui/commit/572f5fc6d27a304651b8f986a3110940dab6f29b))

### ♻️ Refactoring

* **ci:** standardize pipeline chain format ([1c2fb2e](https://github.com/fulviofreitas/eero-ui/commit/1c2fb2e9a643a5aa1792e0c919d3b58209abeb2e))
* update repository_dispatch event type name ([41e991d](https://github.com/fulviofreitas/eero-ui/commit/41e991dc47151bb2892d46b5fc9d93747aefe7e3))

### 📚 Documentation

* simplify Dependency-Updates wiki with mermaid diagrams ([66c1fb6](https://github.com/fulviofreitas/eero-ui/commit/66c1fb60e340ec180549310683ee862fb1cef4c5))

## [2.4.0](https://github.com/fulviofreitas/eero-ui/compare/v2.3.7...v2.4.0) (2026-01-17)

### ✨ Features

* **ci:** add auto-merge workflow for approved PRs ([7a0d500](https://github.com/fulviofreitas/eero-ui/commit/7a0d500abba22e72e5654e37422844ab5eda0ff3))

## [2.3.7](https://github.com/fulviofreitas/eero-ui/compare/v2.3.6...v2.3.7) (2026-01-16)

### 🐛 Bug Fixes

* **tests:** use async test for Python 3.14 compatibility ([16bd19f](https://github.com/fulviofreitas/eero-ui/commit/16bd19ff18a134d8d322842dca1fdb17ae1af314))

## [2.3.6](https://github.com/fulviofreitas/eero-ui/compare/v2.3.5...v2.3.6) (2026-01-16)

### 🐛 Bug Fixes

* **renovate:** increase rate limits to avoid blocking PRs ([a3b7b2e](https://github.com/fulviofreitas/eero-ui/commit/a3b7b2e503376ffea18da846b4d57b694df5025e))

## [2.3.5](https://github.com/fulviofreitas/eero-ui/compare/v2.3.4...v2.3.5) (2026-01-16)

### 🐛 Bug Fixes

* **renovate:** add recreateClosed to allow PR recreation ([4694fd5](https://github.com/fulviofreitas/eero-ui/commit/4694fd572648df84a08cf38dfb06c966bca04182))

## [2.3.4](https://github.com/fulviofreitas/eero-ui/compare/v2.3.3...v2.3.4) (2026-01-16)

### 🐛 Bug Fixes

* **ci:** disable registry cache for PR builds ([92a74ab](https://github.com/fulviofreitas/eero-ui/commit/92a74ab834f9225efb3cbb5ce7d6a3e07929bf92))

## [2.3.3](https://github.com/fulviofreitas/eero-ui/compare/v2.3.2...v2.3.3) (2026-01-16)

### 🐛 Bug Fixes

* **renovate:** use valid commitlint type 'chore' for dependency updates ([cc89a42](https://github.com/fulviofreitas/eero-ui/commit/cc89a425b7dd7199b24c523ca2e1ee98cb18f825))

## [2.3.2](https://github.com/fulviofreitas/eero-ui/compare/v2.3.1...v2.3.2) (2026-01-16)

### 🐛 Bug Fixes

* **renovate:** add RENOVATE_REPOSITORIES to specify target repo ([3b902b7](https://github.com/fulviofreitas/eero-ui/commit/3b902b792fe8055583ca24b3e15af32aea17dfd3))

## [2.3.1](https://github.com/fulviofreitas/eero-ui/compare/v2.3.0...v2.3.1) (2026-01-16)

### 🐛 Bug Fixes

* **ci:** remove repository_dispatch trigger from CI workflow ([0734fa8](https://github.com/fulviofreitas/eero-ui/commit/0734fa80d0d9d555c77ffaecda3c55e79b0cabc2))
* **renovate:** add explicit 'at any time' schedule for immediate PR creation ([05ced12](https://github.com/fulviofreitas/eero-ui/commit/05ced126e6df145abb5e0e77d612a67591951aca))

### 📚 Documentation

* update dependency docs with schedule fix explanation ([dc8e5bf](https://github.com/fulviofreitas/eero-ui/commit/dc8e5bfd79d9bdf8ed4fb8e8aa78703042a81022))

## [2.3.0](https://github.com/fulviofreitas/eero-ui/compare/v2.2.2...v2.3.0) (2026-01-16)

### ✨ Features

* **ui:** display eero-api API version in sidebar footer ([4ce5897](https://github.com/fulviofreitas/eero-ui/commit/4ce58978479755a7cd82e8fb3ef462a8771c3ac3))

### 📚 Documentation

* update Dependency-Updates wiki with immediate PR creation ([f128702](https://github.com/fulviofreitas/eero-ui/commit/f128702fc321159aba20dbd59912d46a6b44a4ac))

## [2.2.2](https://github.com/fulviofreitas/eero-ui/compare/v2.2.1...v2.2.2) (2026-01-16)

### 🐛 Bug Fixes

* **renovate:** remove schedule restriction for immediate PR creation ([a33278a](https://github.com/fulviofreitas/eero-ui/commit/a33278a265f18da7a508e9ce25debcc950b773ca))

## [2.2.1](https://github.com/fulviofreitas/eero-ui/compare/v2.2.0...v2.2.1) (2026-01-16)

### 🐛 Bug Fixes

* **renovate:** fix config warnings and improve settings ([c4f1d35](https://github.com/fulviofreitas/eero-ui/commit/c4f1d35606ee1b685177cb7dbdb40ce78ea2a5cc))

## [2.2.0](https://github.com/fulviofreitas/eero-ui/compare/v2.1.0...v2.2.0) (2026-01-16)

### ✨ Features

* **docker:** add OCI image labels and annotations ([01123bc](https://github.com/fulviofreitas/eero-ui/commit/01123bcbfbf5e990cc2b73c3328a9f247ab397e9))

### ⚡ Performance

* **docker:** add multi-layer caching strategy for faster builds ([e0d9b1b](https://github.com/fulviofreitas/eero-ui/commit/e0d9b1bc0f31924566c7cfc72fd53eea0b8dc380))

## [2.1.0](https://github.com/fulviofreitas/eero-ui/compare/v2.0.1...v2.1.0) (2026-01-16)

### ✨ Features

* **ci:** add Renovate for automated eero-api dependency updates ([530150c](https://github.com/fulviofreitas/eero-ui/commit/530150c9230bdc232429b0210cbb4c21ab991898))

### 📚 Documentation

* modernize README and add wiki documentation ([77ae4b3](https://github.com/fulviofreitas/eero-ui/commit/77ae4b3609b324abc4c2e30e7bcede87772dbc67))

## [2.0.1](https://github.com/fulviofreitas/eero-ui/compare/v2.0.0...v2.0.1) (2026-01-16)

### 🐛 Bug Fixes

* **ci:** use workflow_run to trigger Docker after Release ([d988d90](https://github.com/fulviofreitas/eero-ui/commit/d988d90391034b69eb0fe68450cd962578db71f7))

## [2.0.0](https://github.com/fulviofreitas/eero-ui/compare/v1.0.0...v2.0.0) (2026-01-16)

### ⚠ BREAKING CHANGES

* **ci:** Consolidated workflows into a proper chain

- Merge commitlint, tests, and security scan into single CI workflow
- CI runs all checks in parallel for faster feedback
- Release workflow triggers after CI succeeds (via workflow_run)
- Docker workflow triggers only on version tags (created by Release)
- Remove standalone commitlint.yml and security.yml (now in CI)
- Remove duplicate docker builds on push to main
- Add workflow chain visualization in step summaries

Chain: CI → Release → Docker

### 🐛 Bug Fixes

* **ci:** disable subject-case rule to allow acronyms ([f9d1310](https://github.com/fulviofreitas/eero-ui/commit/f9d13101501f41121765c810fe7b9bbcc3a1e00f))

### ♻️ Refactoring

* **ci:** chain workflows for proper CI/CD pipeline ([10c9d14](https://github.com/fulviofreitas/eero-ui/commit/10c9d142e3e556c0543c8969a3965616c5ae4150))

### 📚 Documentation

* add CI/CD pipeline section to README ([944ee73](https://github.com/fulviofreitas/eero-ui/commit/944ee73f5d6d7ccbe41dc06d90eb11425e688849))

## 1.0.0 (2026-01-16)

### ✨ Features

* add Docker support and CI/CD workflow ([406d1ba](https://github.com/fulviofreitas/eero-ui/commit/406d1ba00fec705d4646190115d95f709ebf9587))
* add start.sh script with friendly output ([4328c0b](https://github.com/fulviofreitas/eero-ui/commit/4328c0b7e4e1c6dad3cb05f8987a1a452b9303af))
* add unit and integration testing infrastructure ([9348836](https://github.com/fulviofreitas/eero-ui/commit/934883600ccadedc76334eeeef6d3ee65c57b6dc))
* add version number to sidebar footer ([9e507c8](https://github.com/fulviofreitas/eero-ui/commit/9e507c8ddb12b402d515968d06f4d239c51797ba))
* auto-generate session secret in start.sh ([22309c3](https://github.com/fulviofreitas/eero-ui/commit/22309c36cc425bcbba1703296b754351d890e8f6))
* **ci:** add Opengrep SAST security scanning workflow ([63e188b](https://github.com/fulviofreitas/eero-ui/commit/63e188b0daea2ff3176f840d9e5eeadd5e0cf380))
* **ci:** add semantic versioning with automated releases ([8940679](https://github.com/fulviofreitas/eero-ui/commit/8940679fdadc69c8d0d826b1ab80c4b461665826))
* make Connected To eero name clickable on device page ([32a3c7e](https://github.com/fulviofreitas/eero-ui/commit/32a3c7e1cd12cd9df6e5d478feb6e8842117df5d))
* **ui:** display dynamic app version in sidebar footer ([f7318bb](https://github.com/fulviofreitas/eero-ui/commit/f7318bb07ad2b3defce84d6c0195c5f550215eaa))
* use uv for faster builds and add --rebuild flag ([1eb21ef](https://github.com/fulviofreitas/eero-ui/commit/1eb21ef57dce93ff075e58db338354eecebe4e5d))

### 🐛 Bug Fixes

* add SPA fallback routing for client-side routes ([5ec6edd](https://github.com/fulviofreitas/eero-ui/commit/5ec6eddf36b9eede993c5c12520fedf11c7ecce5))
* **ci:** add test session secret for backend tests ([e75ba93](https://github.com/fulviofreitas/eero-ui/commit/e75ba937c74543c12d46d51b4b28c24a8e63d3ce))
* **ci:** download Opengrep binary from GitHub releases ([5fab381](https://github.com/fulviofreitas/eero-ui/commit/5fab38102f8888d3365d0c7d97ec2a7e4bd0aa05))
* **ci:** fix SARIF output and add modern human-readable summary ([bec649f](https://github.com/fulviofreitas/eero-ui/commit/bec649f46d7511bd8c33659b52f536111720cc7a))
* **ci:** streamline workflow triggers for reliable releases ([90ffd90](https://github.com/fulviofreitas/eero-ui/commit/90ffd905e075c38f876641469b152a3011838ce1))
* **ci:** update CodeQL action to v4 to address deprecation warning ([f9a072c](https://github.com/fulviofreitas/eero-ui/commit/f9a072cca659fd84864c1d37a138eb028ebd5745))
* **ci:** use full Opengrep CLI binary and fix SARIF output ([cade6bb](https://github.com/fulviofreitas/eero-ui/commit/cade6bbbd99f1fed8c2022224dd133c352224968))
* correct docker-compose environment variable syntax ([92d37af](https://github.com/fulviofreitas/eero-ui/commit/92d37afdd6fd37ff4aa8f2bfd3ff1c8fe7af4572))
* **deps:** add esbuild override to fix GHSA-67mh-4wv8-2f99 ([c6dd4b5](https://github.com/fulviofreitas/eero-ui/commit/c6dd4b5d57ee600f22fbcab6c4716dfc7ceffab0))
* **deps:** add npm override for cookie vulnerability CVE-2024-47764 ([51abdf4](https://github.com/fulviofreitas/eero-ui/commit/51abdf40fe5340370b75d76983ece945b7e073f8)), closes [#2](https://github.com/fulviofreitas/eero-ui/issues/2)
* remove back to dashboard link from network page ([3ef31ca](https://github.com/fulviofreitas/eero-ui/commit/3ef31ca6668c00bb904ef7616e019f3178a6e70d))
* show Transfer Rates block for wired devices ([d90cea9](https://github.com/fulviofreitas/eero-ui/commit/d90cea9584da4e9bc464547926673f44059b4540))
* UI improvements for network, eeros, and profiles pages ([e9f881e](https://github.com/fulviofreitas/eero-ui/commit/e9f881e1d30ae011157625f82e38b1bff1b6a673))

### ♻️ Refactoring

* **security:** reduce false positives in security rules ([7b3a705](https://github.com/fulviofreitas/eero-ui/commit/7b3a705db68a721f518b221d10ffe61c98e4bcc8))

### 📚 Documentation

* add --rebuild flag documentation to README ([91e9ea4](https://github.com/fulviofreitas/eero-ui/commit/91e9ea47badd95739dc651e4ac3f733b89fb4cc7))
* add untested UI operations to known issues ([f03c493](https://github.com/fulviofreitas/eero-ui/commit/f03c493f5c3eeb5dca870c33758f11c71db6746d))
* simplify quick start since start.sh auto-generates secret ([61b0bcc](https://github.com/fulviofreitas/eero-ui/commit/61b0bccf2a1e39057d842b4c7861c28dcc3071fd))
* update README with testing info, known issues, and roadmap ([9dd96ac](https://github.com/fulviofreitas/eero-ui/commit/9dd96acf8835a84827182abe0473f6e2525b416e))

## [1.0.0] - 2026-01-15

### ✨ Features

- Initial release of Eero UI Dashboard
- FastAPI backend with eero-api SDK integration
- SvelteKit frontend with modern dashboard UI
- Device management and monitoring
- Network configuration and status
- Profile management
- Authentication flow with verification codes

### 🔧 Maintenance

- CI/CD pipeline with GitHub Actions
- Automated testing for frontend and backend
- Semantic versioning with automated releases
