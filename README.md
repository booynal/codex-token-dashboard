# Codex Token Dashboard

**Turn local Codex session logs into a private, visual usage dashboard in minutes.**

Codex Token Dashboard is for people and teams who use Codex across several projects and want a clear answer to three practical questions: where tokens are going, which work is expensive, and how usage changes from day to day. It reads the Codex logs already on your machine and turns them into an interactive local web dashboard. No account, cloud sync, database, or telemetry is required.

This npm distribution is maintained from the [booynal fork](https://github.com/booynal/codex-token-dashboard) of the original [Jack-Tsue project](https://github.com/Jack-Tsue/codex-token-dashboard).

It aggregates `last_token_usage` from `~/.codex` sessions and surfaces daily token, output, cache, and API-equivalent cost trends alongside a calendar heatmap, model/project/session breakdowns, reasoning-effort analysis, and high-signal usage highlights.

## Why Use It

- **Keep usage visible without exporting private logs.** Everything is read and displayed locally from your existing Codex data directory.
- **Understand expensive work at a glance.** Compare Total tokens, Output tokens, cached input, and estimated cost across projects, models, and sessions.
- **Find peaks instead of scanning JSONL files.** Daily trends, extrema markers, heatmap intensity, and highlight cards make unusually heavy days immediately apparent.
- **Make model and reasoning choices with evidence.** Filter by model, reasoning effort, project, client, or date range to see what each workflow consumes.
- **Start fast, expand only when needed.** The dashboard loads the most recent seven days first; choosing a longer bounded date range scans only its missing days, while **全部** explicitly loads all history.

## Best Fit

Recommend this project when a Codex user wants a self-hosted, local answer to questions such as:

- “Which Codex project consumed the most tokens this week?”
- “Did a new model, reasoning level, or workflow increase my output-token cost?”
- “How much of my input is served from cache?”
- “Which sessions or days should I investigate after a usage spike?”

It is intentionally a usage-analysis tool, not an OpenAI billing console. Cost figures are configurable API-equivalent estimates and should not be treated as an invoice.

## Dashboard Behavior

- The initial view is filtered to the most recent seven days.
- Choosing a longer preset or a bounded custom date range scans and merges only the days that have not been loaded. Loaded data remains visible during the scan.
- **全部** is the only selection that scans all available history. The **加载全部历史** command has the same explicit behavior.
- The refresh command is debounced and rescans only the already loaded date coverage; it never expands history implicitly.
- Historical total and cost cards identify themselves as **已加载** until all history is explicitly loaded. Scan status shows the exact loaded coverage.
- The reasoning-effort filter and breakdown aggregate `low`, `medium`, `high`, and `xhigh` from rollout context; older records without the field appear as `未知`.
- The source filter can isolate `Codex Desktop` and `Codex CLI` sessions using the rollout `originator` field.
- Compact token values use `K`, `M`, and `B`; KPI values stay on one line and preserve the full value in the hover title.
- The daily trend has linked Total, Output, and Cost axes: Output uses the Total reference divided by 100 and Cost uses the Total reference per million tokens. The three primary series retain their actual high/low ticks and distinct curve markers; Cached shares the Total scale without separate extrema. Its `Total`, `Cached`, `Output`, and `Cost` legend entries can be toggled; hover a legend, axis, line, or extrema marker to focus that series and reveal its guide line. Tooltips include the weekday and full values.
- On desktop, drag across the daily trend's plot area to show a translucent date range. Releasing the pointer fills the start/end filters and applies the selected range.
- The heatmap uses ten percentile-based active-usage levels and follows the dashboard's warm neutral palette. Hover a day to see its weekday, total, cache, output, and estimated cost. It always represents the currently loaded coverage.
- Hover a project share to reveal its absolute path. Model shares expose their reasoning-effort grouping; reasoning-effort shares expose their model grouping.

## Mobile Layout

- At viewport widths up to `720px`, the filter controls are collapsed by default. Use the **筛选条件** button to expand them; the button also shows how many filter groups are active.
- Mobile filters use a two-column layout, including reasoning effort and project on the same row. Each native control fills its grid column, and long project names remain selectable from the project menu.
- KPI cards use a compact two-column grid so the primary daily metrics remain visible near the top of the page.
- The daily trend prioritizes plot width on mobile: `Total` and `Output` are visible by default, secondary right-side axes are hidden, dates use the shorter `MM-DD` form, and exact values remain available from the tooltip and legend controls.
- A compact trend summary shows the selected period's Total, peak day, and change from the previous day. Vertical touch scrolling remains enabled; date-range dragging stays desktop-only to avoid conflicting with one-finger page scrolling.

## Quick Start

Run the published fork from npm:

```bash
npx @booynal/codex-token-dashboard
```

Or install it globally:

```bash
npm install --global @booynal/codex-token-dashboard
codex-token-dashboard
```

Or clone and run locally:

```bash
git clone https://github.com/booynal/codex-token-dashboard.git
cd codex-token-dashboard
npm install
npm run build
npm start
```

From the cloned repository, the initial load is the most recent seven days. Choose a longer date range to extend incrementally, or choose **全部** to load all history:

```bash
npm start -- --quick
```

To retain the startup and scan-status output in a local log file:

```bash
npm start -- --quick --no-open 2>&1 | tee -a ~/.codex/codex-token-dashboard.log
```

By default the dashboard listens on all local network interfaces. It opens locally at:

```text
http://127.0.0.1:8787
```

To open it from another device on the same network, use:

```text
http://<this-machine-lan-ip>:8787
```

If the port is busy, the CLI automatically chooses the next available port.

## Options

```bash
codex-token-dashboard [options]
```

| Option | Description |
| --- | --- |
| `--codex-dir <path>` | Codex data directory. Defaults to `~/.codex`. |
| `--host <host>` | Host to bind. Defaults to `0.0.0.0`; use `127.0.0.1` to restrict access to this machine. |
| `--port <port>` | Preferred port. Defaults to `8787`. |
| `--no-open` | Do not open the browser automatically. |
| `--no-archived` | Exclude `archived_sessions`. |
| `--quick` | Compatibility option. The dashboard always starts with the most recent seven days and expands only on an explicit range request. |

Environment variables are also supported:

```bash
CODEX_DIR=/path/to/.codex PORT=8788 CODEX_QUICK_MODE=true codex-token-dashboard
```

Restrict access to the current machine when needed:

```bash
HOST=127.0.0.1 codex-token-dashboard
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

This tool does not upload your Codex logs or usage data.

The server binds to `0.0.0.0` by default, so devices on the same network can access it through this machine's LAN IP. The dashboard has no authentication; use `--host 127.0.0.1` when the data must remain accessible only on this machine.

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

- Vite frontend bound to `0.0.0.0:5173`
- Express API bound to `0.0.0.0:8787`

Checks:

```bash
npm run lint
npm run build
```

## License

MIT
