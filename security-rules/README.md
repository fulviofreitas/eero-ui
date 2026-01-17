# 🔐 Security Rules

Custom Semgrep security rules for the Eero UI project.

## Rules Overview

| File | Language | Rules | Focus |
|------|----------|-------|-------|
| `javascript-security.yaml` | JS/TS | 8 | XSS, eval, localStorage, hardcoded keys |
| `python-security.yaml` | Python | 10 | Injection, crypto, deserialization, SSL |
| `general-security.yaml` | All | 6 | Secrets, tokens, keys, Docker |

## Rule Categories

### JavaScript/TypeScript
- **XSS Prevention**: `innerHTML`, `document.write`, Svelte `{@html}`
- **Code Injection**: `eval()`, `new Function()`
- **Sensitive Data**: localStorage with tokens/passwords
- **Hardcoded Secrets**: API keys in source code

### Python
- **Injection**: SQL injection, command injection, `eval()`, `exec()`
- **Cryptography**: MD5, SHA-1 (deprecated)
- **Deserialization**: `pickle`, unsafe `yaml.load()`
- **SSL/TLS**: Disabled certificate verification
- **FastAPI**: Insecure CORS configurations

### General
- **Secrets**: Private keys, AWS keys, GitHub tokens, Stripe keys
- **Webhooks**: Slack webhook URLs
- **Docker**: `:latest` tag usage

## Running Locally

```bash
# Install Semgrep
pip install semgrep

# Run scan
semgrep --config security-rules .

# Run with community rulesets
semgrep --config p/python --config p/javascript --config security-rules .

# Generate SARIF report
semgrep --config security-rules --sarif --output semgrep.sarif .
```

## Customizing Rules

Rules use Semgrep syntax. Key elements:

```yaml
rules:
  - id: unique-rule-id
    languages:
      - python
    message: |
      Description of the issue and how to fix it.
    severity: ERROR  # ERROR, WARNING, INFO
    pattern: dangerous_function($X)
    paths:
      exclude:
        - "**/test*"
    metadata:
      category: security
      cwe: CWE-XXX
```

## Excluding False Positives

Add patterns to exclude specific paths:

```yaml
paths:
  exclude:
    - "**/test*"           # Test files
    - "**/*.test.*"        # Test files
    - "**/mock*"           # Mock files
    - "**/conftest.py"     # Pytest configuration
```

## GitHub Actions Integration

The security scan runs automatically on:
- Pull requests to `master`
- Pushes to `master`

Results appear in:
1. **Workflow Summary** - Human-readable report
2. **Security Tab** - Code scanning alerts
3. **PR Comments** - Summary of findings

## Adding New Rules

1. Choose the appropriate YAML file based on language
2. Add your rule following the template above
3. Test locally with `semgrep --config security-rules .`
4. Push and verify in CI

## Community Rulesets

In addition to custom rules, the CI also uses Semgrep community rulesets:

- `p/python` - Python security rules
- `p/javascript` - JavaScript/TypeScript security rules
- `p/security-audit` - General security audit rules

Browse more at [semgrep.dev/r](https://semgrep.dev/r)
