import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CircleDollarSign,
  Database,
  FolderGit2,
  RefreshCw,
  Settings2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import './styles.css';

const DEFAULT_PRICES = {
  gpt56Sol: {
    label: 'GPT-5.6 Sol',
    input: 5,
    cached: 0.5,
    output: 30,
  },
  gpt56Terra: {
    label: 'GPT-5.6 Terra',
    input: 2,
    cached: 0.2,
    output: 12,
  },
  gpt56Luna: {
    label: 'GPT-5.6 Luna',
    input: 0.2,
    cached: 0.02,
    output: 1.2,
  },
  gpt55: {
    label: 'GPT-5.5',
    input: 5,
    cached: 0.5,
    output: 30,
  },
  gpt54: {
    label: 'GPT-5.4',
    input: 2.5,
    cached: 0.25,
    output: 15,
  },
  gpt54Mini: {
    label: 'GPT-5.4 mini',
    input: 0.75,
    cached: 0.075,
    output: 4.5,
  },
};

const MODEL_MAP = {
  'gpt-5.6': 'gpt56Sol',
  'gpt-5.6-sol': 'gpt56Sol',
  'gpt-5.6-terra': 'gpt56Terra',
  'gpt-5.6-luna': 'gpt56Luna',
  'gpt-5.5': 'gpt55',
  'gpt-5.4': 'gpt54',
  'gpt-5.2': 'gpt54',
  'codex-auto-review': 'gpt54',
  'gpt-5.1-codex-mini': 'gpt54Mini',
  'gpt-5.4-mini': 'gpt54Mini',
};

const numberFmt = new Intl.NumberFormat('zh-CN');
const compactFmt = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const usdAxisFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const cnyFmt = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

function App() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    source: 'all',
    model: 'all',
    cwd: 'all',
    startDate: '',
    endDate: '',
    datePreset: '',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [fxRate, setFxRate] = useState(7.2);

  useEffect(() => {
    loadUsage();
  }, []);

  async function loadUsage(force = false) {
    setError('');
    force ? setRefreshing(true) : setLoading(true);
    try {
      const response = await fetch(force ? '/api/refresh' : '/api/usage', {
        method: force ? 'POST' : 'GET',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setRaw(data);
      setFilters((current) => fillDefaultDateRange(current, data.events || []));
    } catch (err) {
      setError(`读取 Codex 日志失败：${err.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const events = useMemo(() => raw?.events || [], [raw]);
  const projectLabels = useMemo(() => getProjectDisplayNames(events), [events]);
  const filterOptions = useMemo(
    () => getFilterOptions(events, projectLabels),
    [events, projectLabels]
  );
  const filteredEvents = useMemo(
    () => applyFilters(events, filters),
    [events, filters]
  );
  const analytics = useMemo(
    () => buildAnalytics(filteredEvents, prices, projectLabels),
    [filteredEvents, prices, projectLabels]
  );
  const allAnalytics = useMemo(
    () => buildAnalytics(events, prices, projectLabels),
    [events, prices, projectLabels]
  );

  if (loading) {
    return (
      <Shell>
        <div className="loading-panel">
          <Sparkles size={24} />
          <span>正在读取 Codex token 日志...</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="topbar">
        <div>
          <p className="eyebrow">Codex Usage Ledger</p>
          <h1>Token 用量看板</h1>
          <p className="subtle">
            按 last_token_usage 聚合，金额按 OpenAI API 公开价格估算。
          </p>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={() => setSettingsOpen(!settingsOpen)} title="设置">
            <Settings2 size={18} />
          </button>
          <button className="primary-button" onClick={() => loadUsage(true)} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            {refreshing ? '刷新中' : '刷新数据'}
          </button>
        </div>
      </header>

      {error && (
        <Notice tone="danger" icon={<AlertTriangle size={18} />}>
          {error}
        </Notice>
      )}

      <section className="filter-strip">
        <Select
          label="范围"
          value={filters.source}
          onChange={(source) => setFilters({ ...filters, source })}
          options={[
            ['all', '全部日志'],
            ['current', '当前日志'],
            ['archived', '归档日志'],
          ]}
        />
        <Select
          label="模型"
          value={filters.model}
          onChange={(model) => setFilters({ ...filters, model })}
          options={filterOptions.models}
        />
        <Select
          label="项目"
          value={filters.cwd}
          onChange={(cwd) => setFilters({ ...filters, cwd })}
          options={filterOptions.cwdList}
        />
        <DateField
          label="开始"
          value={filters.startDate}
          onChange={(startDate) => setFilters({ ...filters, startDate, datePreset: '' })}
        />
        <DateField
          label="结束"
          value={filters.endDate}
          onChange={(endDate) => setFilters({ ...filters, endDate, datePreset: '' })}
        />
        <DatePresetField
          value={filters.datePreset}
          onChange={(datePreset) => setFilters((current) => ({
            ...current,
            datePreset,
            ...getDateRangePreset(datePreset),
          }))}
        />
      </section>

      {settingsOpen && (
        <SettingsPanel
          prices={prices}
          setPrices={setPrices}
          fxRate={fxRate}
          setFxRate={setFxRate}
        />
      )}

      <section className="kpi-grid">
        <KpiCard
          icon={<Activity size={18} />}
          label="今日 Token"
          value={compactFmt.format(analytics.today.totalTokens)}
          detail={`${numberFmt.format(analytics.today.totalTokens)} tokens`}
        />
        <KpiCard
          icon={<CircleDollarSign size={18} />}
          label="今日估算金额"
          value={usdFmt.format(analytics.today.costUsd)}
          detail={cnyFmt.format(analytics.today.costUsd * fxRate)}
        />
        <KpiCard
          icon={<Database size={18} />}
          label="历史总量"
          value={compactFmt.format(analytics.total.totalTokens)}
          detail={`${numberFmt.format(analytics.total.totalTokens)} tokens`}
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="历史估算金额"
          value={usdFmt.format(analytics.total.costUsd)}
          detail={cnyFmt.format(analytics.total.costUsd * fxRate)}
        />
        <KpiCard
          icon={<Sparkles size={18} />}
          label="缓存命中率"
          value={`${Math.round(analytics.cacheRate * 100)}%`}
          detail={`${compactFmt.format(analytics.total.cachedInputTokens)} cached`}
        />
        <KpiCard
          icon={<CalendarDays size={18} />}
          label="平均每日"
          value={compactFmt.format(analytics.averageDailyTokens)}
          detail={`${analytics.days.length} 个有效日期`}
        />
      </section>

      <section className="main-grid">
        <Panel className="trend-panel" title="每日趋势" meta="Token 与估算金额">
          <TrendChart data={analytics.days} />
        </Panel>
        <Panel title="用量热力图" meta="按 Asia/Shanghai 日期归属">
          <Heatmap data={allAnalytics.days} selectedStart={filters.startDate} selectedEnd={filters.endDate} />
        </Panel>
      </section>

      <section className="split-grid">
        <Panel className="highlight-panel" title="高光时刻" meta="Usage highlights">
          <HighlightGrid highlights={analytics.highlights} />
        </Panel>
        <Panel title="项目占比" meta="按 cwd 聚合">
          <RankList rows={analytics.projects} kind="project" />
        </Panel>
      </section>

      <section className="split-grid bottom-grid">
        <Panel title="模型占比" meta="按 token 总量">
          <ModelChart data={analytics.models} />
        </Panel>
        <Panel title="扫描状态" meta={`${raw?.fileCount || 0} 个文件，${raw?.eventCount || 0} 条 token 事件`}>
          <ScanStatus raw={raw} analytics={analytics} />
        </Panel>
      </section>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <main className="app-shell">
      <div className="page-texture" />
      <div className="content">{children}</div>
    </main>
  );
}

function Notice({ children, icon, tone = 'default' }) {
  return <div className={`notice ${tone}`}>{icon}{children}</div>;
}

function Panel({ title, meta, className = '', children }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      {children}
    </section>
  );
}

function KpiCard({ icon, label, value, detail }) {
  return (
    <article className="kpi-card">
      <div className="kpi-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DatePresetField({ value, onChange }) {
  return (
    <label className="field date-preset-field">
      <span>快捷范围</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">自定义日期</option>
        <optgroup label="日历范围">
          <option value="today">今日</option>
          <option value="thisWeek">本周</option>
          <option value="thisMonth">本月</option>
          <option value="thisYear">本年</option>
        </optgroup>
        <optgroup label="滚动范围">
          <option value="lastWeek">近一周</option>
          <option value="lastHalfMonth">近半月</option>
          <option value="lastMonth">近一月</option>
          <option value="lastQuarter">近三月</option>
          <option value="lastHalfYear">近半年</option>
          <option value="lastYear">近一年</option>
        </optgroup>
      </select>
    </label>
  );
}

function SettingsPanel({ prices, setPrices, fxRate, setFxRate }) {
  function updatePrice(group, field, value) {
    setPrices({
      ...prices,
      [group]: {
        ...prices[group],
        [field]: Number(value || 0),
      },
    });
  }

  return (
    <section className="settings-panel">
      <div>
        <h2>价格与映射</h2>
        <p>
          官方价格按标准处理模式、每 100 万 token 计算。内部模型名映射为估算口径，可在这里调整。
        </p>
      </div>
      <div className="settings-grid">
        {Object.entries(prices).map(([key, price]) => (
          <div className="price-box" key={key}>
            <strong>{price.label}</strong>
            <label>Input <input value={price.input} type="number" step="0.001" onChange={(event) => updatePrice(key, 'input', event.target.value)} /></label>
            <label>Cached <input value={price.cached} type="number" step="0.001" onChange={(event) => updatePrice(key, 'cached', event.target.value)} /></label>
            <label>Output <input value={price.output} type="number" step="0.001" onChange={(event) => updatePrice(key, 'output', event.target.value)} /></label>
          </div>
        ))}
        <div className="price-box mapping-box">
          <strong>模型映射</strong>
          <p>gpt-5.6 / gpt-5.6-sol → GPT-5.6 Sol</p>
          <p>gpt-5.6-terra → GPT-5.6 Terra</p>
          <p>gpt-5.6-luna → GPT-5.6 Luna</p>
          <p>gpt-5.5 → GPT-5.5</p>
          <p>gpt-5.4 / gpt-5.2 / codex-auto-review → GPT-5.4</p>
          <p>gpt-5.1-codex-mini / gpt-5.4-mini → GPT-5.4 mini</p>
          <label>USD → CNY <input value={fxRate} type="number" step="0.01" onChange={(event) => setFxRate(Number(event.target.value || 0))} /></label>
        </div>
      </div>
    </section>
  );
}

function TrendChart({ data }) {
  if (!data.length) return <EmptyState text="当前筛选条件下没有趋势数据" />;
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ left: 4, right: 16, top: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c96442" stopOpacity={0.42} />
              <stop offset="100%" stopColor="#c96442" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b98b45" stopOpacity={0.34} />
              <stop offset="100%" stopColor="#b98b45" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e4ddd2" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#6f665c', fontSize: 12 }} tickMargin={10} />
          <YAxis yAxisId="tokens" tickFormatter={(value) => compactFmt.format(value)} tick={{ fill: '#6f665c', fontSize: 12 }} width={56} />
          <YAxis yAxisId="cost" orientation="right" tickFormatter={(value) => usdAxisFmt.format(value)} tick={{ fill: '#8b7046', fontSize: 12 }} width={48} />
          <Tooltip content={<ChartTooltip />} />
          <Area yAxisId="tokens" type="monotone" dataKey="totalTokens" name="Total" stroke="#9f4d36" fill="url(#tokenFill)" strokeWidth={2.5} />
          <Area yAxisId="tokens" type="monotone" dataKey="cachedInputTokens" name="Cached" stroke="#6d8b74" fill="transparent" strokeWidth={1.8} />
          <Area yAxisId="tokens" type="monotone" dataKey="outputTokens" name="Output" stroke="#3f6574" fill="transparent" strokeWidth={1.8} />
          <Area yAxisId="cost" type="monotone" dataKey="costUsd" name="Cost" stroke="#b98b45" fill="url(#costFill)" strokeWidth={2} strokeDasharray="4 4" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i style={{ background: '#9f4d36' }} />Token</span>
        <span><i style={{ background: '#6d8b74' }} />Cached</span>
        <span><i style={{ background: '#3f6574' }} />Output</span>
        <span><i className="dash" style={{ background: '#b98b45' }} />Cost</span>
      </div>
    </div>
  );
}

function ModelChart({ data }) {
  if (!data.length) return <EmptyState text="没有模型数据" />;
  const colors = ['#9f4d36', '#6d8b74', '#3f6574', '#bd915d', '#766b9d', '#8a8276'];
  const rows = data.slice(0, 8);
  return (
    <div className="chart-frame compact-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 2, right: 14, top: 4, bottom: 4 }} barCategoryGap={12}>
          <CartesianGrid stroke="#e4ddd2" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => compactFmt.format(value)} tick={{ fill: '#6f665c', fontSize: 12 }} />
          <YAxis type="category" dataKey="model" width={104} tick={{ fill: '#4a4038', fontSize: 12 }} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="totalTokens" radius={[0, 4, 4, 0]} barSize={28}>
            {rows.map((entry, index) => (
              <Cell key={entry.model} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="chart-tooltip">
      <strong>{label || row.model}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>
          {item.name || item.dataKey}: {formatTooltipValue(item.dataKey, item.value)}
        </span>
      ))}
      {row.costUsd != null && !payload.some((item) => item.dataKey === 'costUsd') && <span>Cost: {usdFmt.format(row.costUsd)}</span>}
    </div>
  );
}

function Heatmap({ data, selectedStart, selectedEnd }) {
  if (!data.length) return <EmptyState text="没有可展示的热力图数据" />;
  const { cells, months, startDate, endDate } = buildHeatmapCells(data);
  const heatLevels = buildHeatLevels(cells);
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-months" style={{ '--weeks': cells.length / 7 }}>
        <span />
        <div className="month-track">
          {months.map((month) => (
            <span key={`${month.label}-${month.week}`} style={{ gridColumn: `${month.week + 1} / span ${month.span}` }}>
              {month.label}
            </span>
          ))}
        </div>
      </div>
      <div className="heatmap-grid" style={{ '--weeks': cells.length / 7 }}>
        <div className="weekday-labels">
          <span>一</span>
          <span />
          <span>三</span>
          <span />
          <span>五</span>
          <span />
          <span>日</span>
        </div>
        <div className="heatmap">
          {cells.map((cell) => (
            <div
              key={cell.date}
              className={`heat-cell heat-${heatLevels.get(cell.date) || 0} ${isDateInRange(cell.date, selectedStart, selectedEnd) ? 'selected' : ''}`}
              title={`${cell.date}: ${numberFmt.format(cell.totalTokens)} tokens`}
            />
          ))}
        </div>
      </div>
      <div className="heatmap-footer">
        <span>{startDate} 至 {endDate}</span>
        <div className="heatmap-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4, 5].map((level) => (
            <i key={level} className={`heat-${level}`} />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  );
}

function RankList({ rows, kind }) {
  if (!rows.length) return <EmptyState text="没有项目数据" />;
  return (
    <div className="rank-list">
      {rows.slice(0, 8).map((row, index) => (
        <div className="rank-row" key={row.cwd || row.model}>
          <span className="rank-index">{index + 1}</span>
          <div>
            <strong title={row.cwd}>{kind === 'project' ? row.projectName : row.model}</strong>
            <small>{compactFmt.format(row.totalTokens)} tokens · {usdFmt.format(row.costUsd)}</small>
          </div>
          <div className="rank-bar"><span style={{ width: `${row.share * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function HighlightGrid({ highlights }) {
  return (
    <div className="highlight-grid">
      {highlights.map((item) => (
        <article className="highlight-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function ScanStatus({ raw, analytics }) {
  const warnings = raw?.warnings || [];
  return (
    <div className="status-stack">
      <div className="status-line">
        <FolderGit2 size={17} />
        <span>{analytics.sessions.length} 个会话，{analytics.models.length} 个模型，{analytics.projects.length} 个项目路径。</span>
      </div>
      <div className="status-line">
        <Database size={17} />
        <span>扫描耗时 {raw?.scanMs || 0}ms，生成于 {formatTime(raw?.generatedAt)}。</span>
      </div>
      <Notice tone={warnings.length ? 'warn' : 'ok'} icon={warnings.length ? <AlertTriangle size={17} /> : <Sparkles size={17} />}>
        {warnings.length ? `${warnings.length} 条扫描提示，请查看详情。` : '日志解析正常，没有发现异常行。'}
      </Notice>
      {warnings.length > 0 && (
        <div className="warning-list">
          {warnings.slice(0, 5).map((warning, index) => (
            <p key={`${warning.type}-${index}`}>{warning.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function fillDefaultDateRange(current, events) {
  if (current.startDate || current.endDate || !events.length) return current;
  const dates = [...new Set(events.map((event) => event.date))].sort();
  return {
    ...current,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  };
}

function getDateRangePreset(preset) {
  if (!preset) return {};
  const end = parseDate(shanghaiToday());
  const start = new Date(end);

  if (preset === 'thisWeek') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  } else if (preset === 'thisMonth') {
    start.setUTCDate(1);
  } else if (preset === 'thisYear') {
    start.setUTCMonth(0, 1);
  } else if (preset === 'lastWeek') {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (preset === 'lastHalfMonth') {
    start.setUTCDate(start.getUTCDate() - 14);
  } else if (preset === 'lastMonth') {
    shiftDateMonths(start, -1);
    start.setUTCDate(start.getUTCDate() + 1);
  } else if (preset === 'lastQuarter') {
    shiftDateMonths(start, -3);
    start.setUTCDate(start.getUTCDate() + 1);
  } else if (preset === 'lastHalfYear') {
    shiftDateMonths(start, -6);
    start.setUTCDate(start.getUTCDate() + 1);
  } else if (preset === 'lastYear') {
    shiftDateMonths(start, -12);
    start.setUTCDate(start.getUTCDate() + 1);
  }

  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function getFilterOptions(events, projectLabels) {
  const models = [...new Set(events.map((event) => event.model || 'unknown'))].sort();
  const cwdList = [...new Map(events.map((event) => [
    event.cwd || 'unknown',
    projectLabels.get(event.cwd || 'unknown') || event.projectName || projectNameFromPath(event.cwd || 'unknown'),
  ]))].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));
  return {
    models: [['all', '全部模型'], ...models.map((model) => [model, model])],
    cwdList: [['all', '全部项目'], ...cwdList],
  };
}

function applyFilters(events, filters) {
  return events.filter((event) => {
    if (filters.source !== 'all' && event.source !== filters.source) return false;
    if (filters.model !== 'all' && event.model !== filters.model) return false;
    if (filters.cwd !== 'all' && (event.cwd || 'unknown') !== filters.cwd) return false;
    if (filters.startDate && event.date < filters.startDate) return false;
    if (filters.endDate && event.date > filters.endDate) return false;
    return true;
  });
}

function buildAnalytics(events, prices, projectLabels) {
  const today = shanghaiToday();
  const daily = new Map();
  const models = new Map();
  const projects = new Map();
  const sessions = new Map();
  const total = emptyTotals();

  for (const event of events) {
    const costUsd = estimateCost(event, prices);
    addTo(total, event, costUsd);
    addToMap(daily, event.date, event, costUsd, { date: event.date });
    addToMap(models, event.model, event, costUsd, { model: event.model });
    const cwd = event.cwd || 'unknown';
    const projectName = projectLabels.get(cwd) || event.projectName || projectNameFromPath(cwd);
    addToMap(projects, cwd, event, costUsd, {
      cwd,
      projectName,
    });
    addToMap(sessions, event.sessionId, event, costUsd, {
      sessionId: event.sessionId,
      sessionName: event.sessionName || shortSession(event.sessionId),
      cwd,
      projectName,
      model: event.model,
    });
  }

  const days = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  const modelRows = withShares([...models.values()].sort((a, b) => b.totalTokens - a.totalTokens));
  const projectRows = withShares([...projects.values()].sort((a, b) => b.totalTokens - a.totalTokens));
  const sessionRows = withCacheRates([...sessions.values()]).sort((a, b) => b.totalTokens - a.totalTokens);
  const todayRow = daily.get(today) || emptyTotals({ date: today });
  const topDay = maxBy(days, 'totalTokens');
  const topCostDay = maxBy(days, 'costUsd');
  const topSession = maxBy(sessionRows, 'totalTokens');
  const topOutputDay = maxBy(days, 'outputTokens');
  const topCacheRateSession = maxBy(sessionRows.filter((row) => row.inputTokens > 0), 'cacheRate');
  const topProject = projectRows[0] || null;

  return {
    total,
    today: todayRow,
    days,
    models: modelRows,
    projects: projectRows,
    sessions: sessionRows,
    cacheRate: total.inputTokens ? total.cachedInputTokens / total.inputTokens : 0,
    averageDailyTokens: days.length ? total.totalTokens / days.length : 0,
    peaks: {
      topDay,
      topCostDay,
      topSession,
      topCachedSession: maxBy(sessionRows, 'cachedInputTokens'),
    },
    highlights: buildHighlights({
      topDay,
      topCostDay,
      topSession,
      topOutputDay,
      topCacheRateSession,
      topProject,
    }),
  };
}

function estimateCost(event, prices) {
  const priceKey = MODEL_MAP[event.model] || 'gpt54';
  const price = prices[priceKey] || prices.gpt54;
  return (
    (event.uncachedInputTokens / 1_000_000) * price.input +
    (event.cachedInputTokens / 1_000_000) * price.cached +
    (event.outputTokens / 1_000_000) * price.output
  );
}

function addToMap(map, key, event, costUsd, base) {
  if (!map.has(key)) map.set(key, emptyTotals(base));
  addTo(map.get(key), event, costUsd);
}

function addTo(target, event, costUsd) {
  target.inputTokens += event.inputTokens;
  target.cachedInputTokens += event.cachedInputTokens;
  target.uncachedInputTokens += event.uncachedInputTokens;
  target.outputTokens += event.outputTokens;
  target.reasoningOutputTokens += event.reasoningOutputTokens;
  target.totalTokens += event.totalTokens;
  target.costUsd += costUsd;
  target.eventCount += 1;
}

function emptyTotals(extra = {}) {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    eventCount: 0,
    ...extra,
  };
}

function withShares(rows) {
  const max = Math.max(...rows.map((row) => row.totalTokens), 1);
  return rows.map((row) => ({ ...row, share: row.totalTokens / max }));
}

function withCacheRates(rows) {
  return rows.map((row) => ({
    ...row,
    cacheRate: row.inputTokens ? row.cachedInputTokens / row.inputTokens : 0,
  }));
}

function buildHighlights({ topDay, topCostDay, topSession, topOutputDay, topCacheRateSession, topProject }) {
  return [
    {
      label: '最高用量日',
      value: compactFmt.format(topDay?.totalTokens || 0),
      detail: `${topDay?.date || '-'} · ${numberFmt.format(topDay?.totalTokens || 0)} tokens`,
    },
    {
      label: '最高成本日',
      value: usdFmt.format(topCostDay?.costUsd || 0),
      detail: `${topCostDay?.date || '-'} · ${compactFmt.format(topCostDay?.totalTokens || 0)} tokens`,
    },
    {
      label: '缓存命中最高会话',
      value: `${Math.round((topCacheRateSession?.cacheRate || 0) * 100)}%`,
      detail: `${topCacheRateSession?.sessionName || '-'} · ${compactFmt.format(topCacheRateSession?.cachedInputTokens || 0)} cached`,
    },
    {
      label: '最高单会话',
      value: compactFmt.format(topSession?.totalTokens || 0),
      detail: `${topSession?.sessionName || '-'} · ${usdFmt.format(topSession?.costUsd || 0)}`,
    },
    {
      label: '最高输出日',
      value: compactFmt.format(topOutputDay?.outputTokens || 0),
      detail: `${topOutputDay?.date || '-'} · output tokens`,
    },
    {
      label: '最活跃项目',
      value: topProject?.projectName || '-',
      detail: `${compactFmt.format(topProject?.totalTokens || 0)} tokens · ${usdFmt.format(topProject?.costUsd || 0)}`,
    },
  ];
}

function maxBy(rows, field) {
  return rows.reduce((best, row) => (!best || row[field] > best[field] ? row : best), null);
}

function formatTooltipValue(dataKey, value) {
  if (dataKey === 'costUsd') return usdFmt.format(value || 0);
  return numberFmt.format(value || 0);
}

function buildHeatmapCells(days) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const start = new Date(`${days[0].date}T00:00:00`);
  const end = new Date(`${days[days.length - 1].date}T00:00:00`);
  const startOffset = (start.getDay() + 6) % 7;
  const endOffset = (end.getDay() + 6) % 7;
  start.setDate(start.getDate() - startOffset);
  end.setDate(end.getDate() + (6 - endOffset));

  const cells = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    cells.push({ date, totalTokens: byDate.get(date)?.totalTokens || 0 });
  }
  return {
    cells,
    months: buildMonthLabels(cells),
    startDate: days[0].date,
    endDate: days[days.length - 1].date,
  };
}

function buildMonthLabels(cells) {
  const weekCount = cells.length / 7;
  const labels = [];
  let active = null;

  for (let week = 0; week < weekCount; week += 1) {
    const monday = cells[week * 7]?.date;
    const month = Number(monday.slice(5, 7));
    const label = `${month}月`;
    if (!active || active.label !== label) {
      active = { label, week, span: 1 };
      labels.push(active);
    } else {
      active.span += 1;
    }
  }

  return labels;
}

function buildHeatLevels(cells) {
  const values = [...new Set(cells.map((cell) => cell.totalTokens).filter(Boolean))].sort((a, b) => a - b);
  const levels = new Map();

  for (const cell of cells) {
    if (!cell.totalTokens) {
      levels.set(cell.date, 0);
      continue;
    }
    const rank = values.findLastIndex((value) => value <= cell.totalTokens) + 1;
    levels.set(cell.date, Math.max(1, Math.ceil((rank / values.length) * 5)));
  }

  return levels;
}

function isDateInRange(date, start, end) {
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function projectNameFromPath(value = '') {
  if (!value || value === 'unknown') return 'unknown';
  const parts = value.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.at(-1) || value;
}

function getProjectDisplayNames(events) {
  const projects = new Map();
  for (const event of events) {
    const cwd = event.cwd || 'unknown';
    if (!projects.has(cwd)) {
      projects.set(cwd, event.projectName || projectNameFromPath(cwd));
    }
  }

  const names = new Map();
  for (const [cwd, projectName] of projects) {
    const group = names.get(projectName) || [];
    group.push(cwd);
    names.set(projectName, group);
  }

  return new Map([...projects].map(([cwd, projectName]) => {
    const duplicate = names.get(projectName)?.length > 1;
    return [cwd, duplicate ? `${parentNameFromPath(cwd)}/${projectName}` : projectName];
  }));
}

function parentNameFromPath(value = '') {
  if (!value || value === 'unknown') return 'unknown';
  const parts = value.replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.at(-2) || parts.at(-1) || value;
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDateMonths(date, amount) {
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
}

function shortSession(value = '') {
  if (!value) return '';
  return value.length > 14 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function shanghaiToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

createRoot(document.getElementById('root')).render(<App />);
