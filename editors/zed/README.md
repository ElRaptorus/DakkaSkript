# Orkscript (Zed)

Dev extension for `.ork` syntax highlighting. Not published to the Zed marketplace.

## Install

1. In Zed, open the extensions page.
2. Click **Install Dev Extension** (or run `zed: install dev extension`).
3. Select this directory: `editors/zed` (the folder that contains `extension.toml`).

Zed compiles the official [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript) grammar from the commit pinned in `extension.toml`. Orkscript words are highlighted by `languages/orkscript/highlights.scm`, which is generated from `orkscript/dictionary.json`.

Regenerate both this file and the VS Code TextMate grammar from the repo root:

```
node orkscript/scripts/paint-grammar.mjs
```
