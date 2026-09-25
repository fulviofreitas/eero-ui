# Self-hosted fonts

These two variable-font files are self-hosted (WP9 perf pass, plan § 6.2 Tier 4) so the app
never makes an outbound request to Google Fonts. Both are licensed under the SIL Open Font
License 1.1 - see `OFL.txt` in this directory.

| File                       | Family         | Version       | Format          | Subset | Source                                                                                             |
| -------------------------- | -------------- | ------------- | --------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `inter-var.woff2`          | Inter          | 4.001         | variable, woff2 | latin  | Served by Google Fonts (`fonts.gstatic.com`), upstream: https://github.com/rsms/inter              |
| `jetbrains-mono-var.woff2` | JetBrains Mono | 2.211 (2.304) | variable, woff2 | latin  | Served by Google Fonts (`fonts.gstatic.com`), upstream: https://github.com/JetBrains/JetBrainsMono |

Both files were downloaded as-is from the Google Fonts CDN (the same bytes a
`@import url(https://fonts.googleapis.com/...)` would have fetched) and committed verbatim -
no re-encoding, subsetting or re-instancing was performed on them here.

## Copyright

- Inter is Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter).
- JetBrains Mono is Copyright 2020 The JetBrains Mono Project Authors
  (https://github.com/JetBrains/JetBrainsMono).

## Integrity

```
sha256sum static/fonts/inter-var.woff2 static/fonts/jetbrains-mono-var.woff2
3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62  inter-var.woff2
83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be  jetbrains-mono-var.woff2
```

If either hash ever changes without a corresponding version bump in the table above, treat the
file as suspect - re-download it fresh from Google Fonts rather than trusting what's on disk.
