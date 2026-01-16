# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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
- FastAPI backend with eero-client SDK integration
- SvelteKit frontend with modern dashboard UI
- Device management and monitoring
- Network configuration and status
- Profile management
- Authentication flow with verification codes

### 🔧 Maintenance

- CI/CD pipeline with GitHub Actions
- Automated testing for frontend and backend
- Semantic versioning with automated releases
