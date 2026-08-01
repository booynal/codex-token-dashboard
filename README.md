# Codex Token Dashboard

A local web dashboard for visualizing Codex token usage from your `~/.codex` logs.

It reads local Codex session files, aggregates `last_token_usage`, and shows daily trends with separate token/cost axes, a calendar heatmap, responsive project/model filters, project/session breakdowns, highlight moments, cache usage, and estimated API-equivalent cost.

## Dashboard Behavior

- The initial view is filtered to the most recent seven days.
- Default mode returns the recent result first, then refreshes automatically when the background full-history scan completes.
- Quick mode returns the recent result and stops. Use the **扫描全部历史** button in the dashboard to start the full-history scan.
- The source filter can isolate `Codex Desktop` and `Codex CLI` sessions using the rollout `originator` field.
- Compact token values use `K`, `M`, and `B`; KPI values stay on one line and preserve the full value in the hover title.
- The daily trend's cost series and legend both use the same dashed line. The heatmap uses ten percentile-based active-usage levels with a higher-contrast color scale; before a quick-mode full scan, it represents only the loaded recent week.

## Quick Start

Run from npm:

```bash
npx codex-token-dashboard
```

Or run directly from GitHub:

```bash
npx github:Jack-Tsue/codex-token-dashboard
```

Or clone and run locally:

```bash
git clone https://github.com/Jack-Tsue/codex-token-dashboard.git
cd codex-token-dashboard
npm install
npm run build
npm start
```

From the cloned repository, start in quick mode to load only the most recent seven days. The dashboard can then load the full history on demand:

```bash
npm start -- --quick
```

To retain the startup and scan-status output in a local log file:

```bash
npm start -- --quick --no-open 2>&1 | tee -a ~/.codex/codex-token-dashboard.log
```

By default the dashboard opens at:

```text
http://127.0.0.1:8787
```

If the port is busy, the CLI automatically chooses the next available port.

## Options

```bash
codex-token-dashboard [options]
```

| Option | Description |
| --- | --- |
| `--codex-dir <path>` | Codex data directory. Defaults to `~/.codex`. |
| `--host <host>` | Host to bind. Defaults to `127.0.0.1`. |
| `--port <port>` | Preferred port. Defaults to `8787`. |
| `--no-open` | Do not open the browser automatically. |
| `--no-archived` | Exclude `archived_sessions`. |
| `--quick` | Scan the most recent seven days first. Load all history from the dashboard when needed. |

Environment variables are also supported:

```bash
CODEX_DIR=/path/to/.codex PORT=8788 CODEX_QUICK_MODE=true codex-token-dashboard
```

## What It Reads

The dashboard reads these local files when present:

```text
~/.codex/sessions
~/.codex/archived_sessions
~/.codex/session_index.jsonl
~/.codex/.codex-global-state.json
```

It uses:

- `event_msg` records whose payload type is `token_count`
- `payload.info.last_token_usage` for aggregation
- `session_meta.payload.originator` to distinguish Codex Desktop and Codex CLI sessions in the source filter
- `session_index.jsonl` for human-readable session names
- `.codex-global-state.json` for workspace labels when available

It intentionally does not aggregate `total_token_usage`, because that field is cumulative within a session and would double count usage.

## Privacy

This is a local-only tool. It does not upload your Codex logs or usage data.

The local server binds to `127.0.0.1` by default. Your browser talks to the local Express API, and the API reads the configured Codex directory from disk.

Codex logs may include project paths, session names, model names, and other metadata. Review the source before running the dashboard against sensitive environments.

## Cost Estimates

Cost is an estimate using the OpenAI API standard processing prices published at <https://openai.com/api/pricing/>. It is not your Codex, ChatGPT, or Plus billing statement.

The estimate uses:

```text
uncached input * input price
+ cached input * cached price
+ output * output price
```

Reasoning output tokens are displayed as a detail and are not added a second time.

Internal Codex model names are mapped to public GPT pricing buckets in the UI settings:

- `gpt-5.6`, `gpt-5.6-sol` -> GPT-5.6 Sol
- `gpt-5.6-terra` -> GPT-5.6 Terra
- `gpt-5.6-luna` -> GPT-5.6 Luna
- `gpt-5.5` -> GPT-5.5
- `gpt-5.4`, `gpt-5.2`, `codex-auto-review` -> GPT-5.4
- `gpt-5.4-mini`, `gpt-5.1-codex-mini` -> GPT-5.4 mini

You can adjust the price table and USD/CNY exchange rate in the dashboard.

## Development

```bash
npm install
npm run dev
```

The development setup runs:

- Vite frontend at `http://127.0.0.1:5173`
- Express API at `http://127.0.0.1:8787`

Checks:

```bash
npm run lint
npm run build
```

## License

MIT
