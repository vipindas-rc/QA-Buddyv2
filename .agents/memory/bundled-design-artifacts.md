---
name: Bundled design artifact editing
description: How to edit single-file bundled prototypes (claude-design) and screenshot when port-80 proxy is down
---

Some design artifacts (e.g. `artifacts/claude-design/index.html`) are self-contained bundles: real markup + DCLogic script live as a JSON string inside `<script type="__bundler/template">`.

**How to apply:**
0. The extracted working copy (e.g. `template_content.html`) can be STALE — always re-extract from `index.html` and diff before editing; the bundle is the source of truth. Bundle format can change after task merges (e.g. JSON now sits inline right after the script tag with no newline) — match with a tolerant regex, not a fixed layout.
1. Extract: `JSON.parse` the template script content to a temp file, edit there. Keep `template_content.html` in sync when repacking.
1b. Binding parity checker: exclude ALL current `sc-for` aliases (`grep -o 'as="[a-z]*"'`), not a hardcoded list — merged tasks add new loop vars.
2. Repack: `JSON.stringify(tpl).split('</').join('<\\u002F')` — MUST escape `</` or the outer script tag terminates early. Verify roundtrip parse equals source.
3. Template bindings (`{{ key }}`) must all exist in `renderVals()` return object — run a parity check after edits; missing bindings fail silently.

**Why:** editing the bundled JSON directly is unreadable and breaks easily; unescaped `</script>` corrupts the bundle.

Also: if `screenshot type=app_preview` gets ERR_CONNECTION_REFUSED (shared proxy on :80 not listening), screenshot via `type=external_url` with `https://$REPLIT_DEV_DOMAIN/` instead.

To verify interaction-gated UI (modals, hidden states): temporarily flip the default state flag (e.g. `modalOpen: true`), repack, screenshot, then revert and repack — the screenshot tool cannot click.

The prototype can call the real API server: fetch('/api/...') works through the shared :80 proxy (design artifact at `/`, api at `/api`).
