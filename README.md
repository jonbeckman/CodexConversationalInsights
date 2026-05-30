# Codex Conversational Insights

## Agent Install Prompt

Paste this into Codex to install the hook in a new environment:

```text
Install https://github.com/jonbeckman/CodexConversationalInsights as a Codex UserPromptSubmit hook. Let me know which environment variables I need to set when done. Then we can run the backfill process for one prompt to verify, then the full backfill process.
```

Codex Conversational Insights is a shareable Codex hook and CLI that captures
prompt-level coding conversation analytics in Notion. Each row maps to one user
prompt and records the classification, model, tags, skill usage, transcript
metadata, and source.

The project supports two install paths:

- Codex plugin hooks via `.codex-plugin/plugin.json` and `hooks/hooks.json`
- Direct `~/.codex/hooks.json` installation via the CLI

Personal configuration is intentionally not committed. Put Notion tokens,
Notion IDs, install-specific tags, and model overrides in `.env` or in the
plugin data directory.

## Captured Fields

The hook writes one Notion row per prompt hash. It captures:

- `Work Type`, `Intent`, `Category`, `Task Complexity`, and
  `Prompt Specificity`
- `Prompt Model` and `Classifier Model`
- `Tags` as a Notion multi-select, for example `Personal` or `Consensys`
- `Skills Used` as a Notion multi-select keyed by skill file name without
  `.md`
- `Skill Count` and `Skill Evidence`
- `Prompt Hash`, `Prompt Excerpt`, `Session ID`, `Transcript Path`, `CWD`,
  `Project`, `Source`, and `Captured At`

## Requirements

- Node `>=22.22.0`
- `pnpm`
- Codex CLI available at `codex` or
  `/Applications/Codex.app/Contents/Resources/codex`
- A Notion integration token with access to the target data source

Install and build:

```bash
pnpm install
pnpm build
```

`dist/cci.cjs` is committed so plugin installs have a runnable hook entrypoint,
but rebuild it after source changes.

## Configuration

Create a local env file:

```bash
cp .env.example .env
```

Required values:

```bash
NOTION_TOKEN=secret_xxx
CODEX_CONVERSATIONAL_INSIGHTS_NOTION_DATA_SOURCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
CODEX_CONVERSATIONAL_INSIGHTS_NOTION_TAGS=Personal
```

Config precedence, lowest to highest:

1. Repo `.env`
2. `${PLUGIN_DATA}/.env`
3. `CODEX_CONVERSATIONAL_INSIGHTS_ENV_FILE`
4. Explicit process environment variables

Supported Notion token env names are `NOTION_TOKEN` and `NOTION_API_TOKEN`.
Secrets are never printed by `doctor` or hook logs.

## Notion Setup

Provision or validate the data source schema:

```bash
pnpm cci setup-notion
```

The schema operation is add/validate only. It creates missing properties and
select or multi-select options, including `Tags`, but it does not delete
columns or silently change conflicting property types.

Check configuration and connectivity:

```bash
pnpm cci doctor
```

## Quick Start

For direct local installation:

```bash
pnpm install
pnpm build
pnpm cci doctor
pnpm cci setup-notion
pnpm cci install-direct
```

`install-direct` copies the built CLI into
`${CODEX_HOME:-~/.codex}/hooks/codex-conversational-insights/` and upserts only
the `UserPromptSubmit` hook in `~/.codex/hooks.json`.

Uninstall a direct local installation:

```bash
pnpm cci uninstall-direct
```

This removes hook entries and installed hook files, including legacy prototype
files, but preserves state and logs. To also remove local state:

```bash
pnpm cci uninstall-direct --remove-state
```

For plugin installation, install this repo as a Codex plugin. The plugin
manifest lives at `.codex-plugin/plugin.json`, and the bundled hook registry
lives at `hooks/hooks.json`. Put plugin-local configuration in
`${PLUGIN_DATA}/.env`.

## Hook Behavior

The hook only runs on `UserPromptSubmit`. It passes the submitted user prompt to
a child Codex CLI classifier session using
`CODEX_CONVERSATIONAL_INSIGHTS_MODEL`, which defaults to `gpt-5.4-mini`.

The child process receives `CODEX_CONVERSATIONAL_INSIGHTS_CHILD=1`. If a hook is
invoked inside that child session, it exits before classification or Notion
writes, preventing recursive hook calls.

Codex automation prompts are skipped by default. The hook treats
`<heartbeat><automation_id>...` wrappers, explicit automation IDs, and the
legacy `Automation: ... Automation ID: ...` header as automation runs. To
capture automation prompts intentionally, set:

```bash
CODEX_CONVERSATIONAL_INSIGHTS_INCLUDE_AUTOMATIONS=1
```

Plugin installs store state and logs in `${PLUGIN_DATA}`. Direct installs store
state and logs in `${CODEX_HOME:-~/.codex}/conversational-insights`. Plugin
state auto-migrates once from the legacy direct state file when plugin state is
empty.

## Backfill

Backfill today's Codex sessions:

```bash
pnpm cci backfill --date "$(date +%F)"
```

Backfill all local session history:

```bash
pnpm cci backfill --all
```

Historical backfill defaults the prompt model to `gpt-5.5`. Override with:

```bash
CODEX_BACKFILL_PROMPT_MODEL=gpt-5.4 pnpm cci backfill --all
```

Dry-run a backfill without Notion writes:

```bash
pnpm cci backfill --date 2026-05-27 --dry-run --summary
```

## CLI Commands

- `doctor`: validates runtime, env, Codex CLI, Notion reachability, schema,
  hook registration, and state path.
- `setup-notion`: add/validate required Notion schema.
- `install-direct`: install the direct `~/.codex/hooks.json` hook.
- `uninstall-direct`: remove the direct hook and installed hook files.
- `uninstall`: alias for `uninstall-direct`.
- `backfill --all`: scan all Codex sessions and write or update rows.
- `backfill --date YYYY-MM-DD`: scan sessions from one date.
- `sync-state-metadata`: update Notion metadata for known state records.
- `hook user-prompt-submit`: internal hook command.

## Development

Validation commands:

```bash
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build
pnpm cci doctor --dry-run
```

Run the hook manually with a sample payload:

```bash
printf '%s' '{"prompt":"Fix the failing test.","cwd":"/tmp/example","session_id":"manual"}' \
  | pnpm cci hook user-prompt-submit --dry-run
```

Run the recursion guard path:

```bash
CODEX_CONVERSATIONAL_INSIGHTS_CHILD=1 \
  pnpm cci hook user-prompt-submit --dry-run <<'JSON'
{"prompt":"Fix the failing test.","cwd":"/tmp/example","session_id":"manual"}
JSON
```
