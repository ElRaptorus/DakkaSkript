# Vendored Tree-sitter highlight queries

Pinned sources used by `orkscript/scripts/paint-zed-highlights.mjs` (via
`orkscript/scripts/paint-grammar.mjs`) to generate
`editors/zed/languages/orkscript/highlights.scm`.

Zed still compiles the TypeScript parser from the git pin in
`editors/zed/extension.toml`. These files are query sources only — they are
not a grammar.js fork.

## tree-sitter-typescript

- File: `tree-sitter-typescript-highlights.scm`
- Repository: https://github.com/tree-sitter/tree-sitter-typescript
- Path: `queries/highlights.scm`
- Tag: `v0.23.2`
- Commit: `f975a621f4e7f532fe322e13c4f79495e0a7b2e7`
- License: MIT (`tree-sitter-typescript.LICENSE`)

## tree-sitter-javascript (ecma inherit)

tree-sitter-typescript's `tree-sitter.json` lists JavaScript `queries/highlights.scm`
after the TypeScript overlay. That file supplies strings, comments, numbers,
operators, and English keywords.

- File: `tree-sitter-javascript-highlights.scm`
- Repository: https://github.com/tree-sitter/tree-sitter-javascript
- Path: `queries/highlights.scm`
- Tag: `v0.23.1` (the `tree-sitter-javascript` dependency of typescript `v0.23.2`)
- Commit: `3a837b6f3658ca3618f2022f8707e29739c91364`
- License: MIT (`tree-sitter-javascript.LICENSE`)

The generator strips nvim-only `#is-not? local` predicates so Zed will load
the query file.
