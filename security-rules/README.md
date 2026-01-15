# 🔐 Security Rules for Opengrep

This directory contains custom security rules for the Opengrep static analysis scanner.

## 📁 Rule Files

| File | Description | Languages |
|------|-------------|-----------|
| `javascript-security.yaml` | XSS, injection, secrets, Svelte-specific | JS/TS |
| `python-security.yaml` | Injection, crypto, FastAPI-specific | Python |
| `general-security.yaml` | Secrets, credentials, Docker | All |

## 🚀 Quick Start

### Local Scanning

```bash
# Install Opengrep
curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash

# Scan the codebase
opengrep scan -f security-rules . --sarif-output=results.sarif

# View human-readable output
opengrep scan -f security-rules .
```

### GitHub Actions

The `security.yml` workflow automatically runs on:
- Pull requests to `main`/`master`/`develop`
- Pushes to `main`/`master`

Results are uploaded to the GitHub Security tab.

## 📝 Rule Format

Rules use the Opengrep (Semgrep-compatible) YAML format:

```yaml
rules:
  - id: unique-rule-id
    languages:
      - javascript
      - typescript
    message: |
      Description of the issue and how to fix it.
    severity: ERROR  # ERROR, WARNING, INFO
    pattern: dangerous_function($ARG)
    metadata:
      category: security
      subcategory: injection
      cwe: CWE-XXX
```

## 🎯 Rule Categories

### By Severity

| Severity | When to Use |
|----------|-------------|
| `ERROR` | Critical vulnerabilities that must be fixed |
| `WARNING` | Security issues that should be addressed |
| `INFO` | Best practice recommendations |

### By Category

- **secrets** - Hardcoded credentials, API keys, tokens
- **injection** - SQL, command, code injection
- **xss** - Cross-site scripting vulnerabilities
- **cryptography** - Weak algorithms, insecure random
- **deserialization** - Unsafe deserialization
- **configuration** - Insecure settings
- **sensitive-data** - Logging/exposing secrets

## ➕ Adding New Rules

1. Create a new YAML file or add to existing:

```yaml
- id: my-custom-rule
  languages:
    - python
  message: |
    Clear description of the issue.
    Include how to fix it.
  severity: WARNING
  pattern: $FUNC.unsafe_method($ARG)
  metadata:
    category: security
    subcategory: custom
    cwe: CWE-XXX
```

2. Test locally:

```bash
opengrep scan -f security-rules/my-rules.yaml .
```

3. Commit and push - the CI will pick up new rules automatically.

## 🔧 Pattern Types

### Basic Pattern
```yaml
pattern: eval($CODE)
```

### Multiple Patterns (OR)
```yaml
pattern-either:
  - pattern: eval($CODE)
  - pattern: exec($CODE)
```

### Pattern with Context
```yaml
pattern: $CURSOR.execute($QUERY)
pattern-inside: |
  def $FUNC(...):
    ...
```

### Regex Pattern
```yaml
pattern-regex: 'password\s*=\s*["\x27][^"\x27]+["\x27]'
```

## 📚 Resources

- [Opengrep Documentation](https://opengrep.dev/docs)
- [Semgrep Rule Syntax](https://semgrep.dev/docs/writing-rules/rule-syntax)
- [CWE Database](https://cwe.mitre.org/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

## 🤝 Contributing

When adding new rules:

1. Use descriptive `id` names following the pattern: `{language}-{category}-{issue}`
2. Include clear `message` with fix recommendations
3. Add `metadata` with CWE references where applicable
4. Test rules locally before committing
5. Consider false positive rates

## ⚠️ Suppressing Findings

To suppress a finding in code:

```javascript
// opengrep-ignore
const result = eval(safeCode);  // This is intentionally safe
```

```python
# opengrep-ignore
result = eval(validated_expression)  # Validated input
```

Or use rule-specific suppression:

```javascript
// opengrep-ignore: js-insecure-eval
```
