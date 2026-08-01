import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  ReferenceDot,
  ReferenceArea,
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
const CLIENT_SOURCE_FILTERS = new Set(['desktop', 'cli']);

const numberFmt = new Intl.NumberFormat('zh-CN');
const compactTokenFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const compactUsdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
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
const HEAT_LEVEL_THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.52, 0.65, 0.76, 0.86, 0.94];
const TREND_SERIES = [
  { key: 'totalTokens', label: 'Total', color: '#9f4d36', fill: 'url(#tokenFill)', strokeWidth: 2.5, yAxisId: 'tokens' },
  { key: 'cachedInputTokens', label: 'Cached', color: '#6d8b74', fill: 'transparent', strokeWidth: 1.8, yAxisId: 'tokens' },
  { key: 'outputTokens', label: 'Output', color: '#3f6574', fill: 'transparent', strokeWidth: 1.8, yAxisId: 'output' },
  { key: 'costUsd', label: 'Cost', color: '#b98b45', fill: 'url(#costFill)', strokeWidth: 2, yAxisId: 'cost', strokeDasharray: '4 4' },
];
const REASONING_EFFORT_LABELS = {
  low: '低 (low)',
  medium: '中 (medium)',
  high: '高 (high)',
  xhigh: '超高 (xhigh)',
  none: '关闭 (none)',
  unknown: '未知 (unknown)',
};
const FIXED_MODEL_ORDER = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
];

function App() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({
    source: 'all',
    model: 'all',
    reasoningEffort: 'all',
    cwd: 'all',
    startDate: '',
    endDate: '',
    datePreset: '',
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [fxRate, setFxRate] = useState(7.2);
  const [visibleTrendSeries, setVisibleTrendSeries] = useState(() => Object.fromEntries(
    TREND_SERIES.map(({ key }) => [key, true])
  ));
  const [hoveredTrendSeries, setHoveredTrendSeries] = useState(null);
  const loadUsage = useCallback(async (force = false, background = false) => {
    if (!background) {
      setError('');
      force ? setRefreshing(true) : setLoading(true);
    }
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
      if (!background) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const scanFullHistory = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/scan-full', { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setRaw(data);
      setFilters((current) => fillDefaultDateRange(current, data.events || []));
    } catch (err) {
      setError(`读取完整历史失败：${err.message}`);
    }
  }, []);

  const updateDateRange = useCallback((nextFilters) => {
    setFilters(nextFilters);
    if (rangeExtendsBeyondRecentWeek(nextFilters, raw?.scan)
      && ['ready', 'failed'].includes(raw?.scan?.state)) {
      void scanFullHistory();
    }
  }, [raw?.scan, scanFullHistory]);

  const toggleTrendSeries = useCallback((key) => {
    setVisibleTrendSeries((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadUsage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsage]);

  useEffect(() => {
    if (raw?.scan?.state !== 'scanning') return undefined;
    const timer = window.setTimeout(() => loadUsage(false, true), 1000);
    return () => window.clearTimeout(timer);
  }, [raw, loadUsage]);

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
  const hasFullHistory = raw?.scan?.state === 'complete';
  const isFullScanPending = Boolean(raw) && !hasFullHistory;
  const isQuickMode = raw?.scan?.quickMode === true;

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

      {raw?.scan?.state === 'ready' && (
        <Notice tone="warn" icon={<Sparkles size={18} />}>
          <span>近一周数据已就绪。</span>
          <button className="notice-button" onClick={scanFullHistory}>扫描全部历史</button>
        </Notice>
      )}

      {raw?.scan?.state === 'scanning' && (
        <Notice tone="warn" icon={<RefreshCw size={18} className="spin" />}>
          近一周数据已就绪，正在后台补全历史日志。
        </Notice>
      )}

      {raw?.scan?.state === 'failed' && (
        <Notice tone="warn" icon={<AlertTriangle size={18} />}>
          <span>历史日志补全失败：{raw.scan.error}</span>
          <button className="notice-button" onClick={scanFullHistory}>重新扫描全部历史</button>
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
            ['desktop', 'Codex 桌面端'],
            ['cli', 'Codex CLI'],
          ]}
        />
        <Select
          label="模型"
          value={filters.model}
          onChange={(model) => setFilters({ ...filters, model })}
          options={filterOptions.models}
        />
        <Select
          label="思考级别"
          value={filters.reasoningEffort}
          onChange={(reasoningEffort) => setFilters({ ...filters, reasoningEffort })}
          options={filterOptions.reasoningEfforts}
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
          onChange={(startDate) => updateDateRange({ ...filters, startDate, datePreset: '' })}
        />
        <DateField
          label="结束"
          value={filters.endDate}
          onChange={(endDate) => updateDateRange({ ...filters, endDate, datePreset: '' })}
        />
        <DatePresetField
          value={filters.datePreset}
          onChange={(datePreset) => updateDateRange({
            ...filters,
            datePreset,
            ...getDateRangePreset(datePreset),
          })}
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

      <section className={`kpi-grid ${isFullScanPending ? 'recent-only' : ''}`}>
        <KpiCard
          icon={<Activity size={18} />}
          label="今日 Token"
          value={compactTokenFmt.format(analytics.today.totalTokens)}
          detail={`${numberFmt.format(analytics.today.totalTokens)} tokens`}
        />
        <KpiCard
          icon={<CircleDollarSign size={18} />}
          label="今日估算金额"
          value={compactUsdFmt.format(analytics.today.costUsd)}
          detail={cnyFmt.format(analytics.today.costUsd * fxRate)}
        />
        <KpiCard
          icon={<CalendarDays size={18} />}
          label="平均每日"
          value={compactTokenFmt.format(analytics.averageDailyTokens)}
          detail={`${analytics.days.length} 个有效日期`}
        />
        <KpiCard
          icon={<Sparkles size={18} />}
          label="缓存命中率"
          value={`${Math.round(analytics.cacheRate * 100)}%`}
          detail={`${compactTokenFmt.format(analytics.total.cachedInputTokens)} cached`}
        />
        {!isFullScanPending && (
          <>
            <KpiCard
              icon={<Database size={18} />}
              label="历史总量"
              value={compactTokenFmt.format(analytics.total.totalTokens)}
              detail={`${numberFmt.format(analytics.total.totalTokens)} tokens`}
            />
            <KpiCard
              icon={<TrendingUp size={18} />}
              label="历史估算金额"
              value={compactUsdFmt.format(analytics.total.costUsd)}
              detail={cnyFmt.format(analytics.total.costUsd * fxRate)}
            />
          </>
        )}
      </section>

      <section className="main-grid">
        <Panel className="trend-panel" title="每日趋势" meta="Token、Output 与估算金额">
          <TrendChart
            data={analytics.days}
            visibleSeries={visibleTrendSeries}
            onToggleSeries={toggleTrendSeries}
            hoveredSeries={hoveredTrendSeries}
            onHoverSeries={setHoveredTrendSeries}
            onSelectDateRange={(range) => updateDateRange({ ...filters, ...range, datePreset: '' })}
          />
        </Panel>
        <Panel title="用量热力图" meta="按 Asia/Shanghai 日期归属">
          {isFullScanPending && !isQuickMode
            ? <HistoryLoading />
            : <Heatmap data={allAnalytics.days} selectedStart={filters.startDate} selectedEnd={filters.endDate} />}
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
        <Panel title="思考级别占比" meta="按 token 总量">
          <RankList rows={analytics.reasoningEfforts} kind="reasoningEffort" />
        </Panel>
        <Panel title="扫描状态" meta={`${raw?.fileCount || 0} 个文件，${raw?.eventCount || 0} 条 token 事件`}>
          <ScanStatus raw={raw} analytics={allAnalytics} />
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
        <p title={label}>{label}</p>
        <strong title={value}>{value}</strong>
        <span title={detail}>{detail}</span>
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
          <option value="all">全部</option>
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

function TrendChart({ data, visibleSeries, onToggleSeries, hoveredSeries, onHoverSeries, onSelectDateRange }) {
  const [dateDrag, setDateDrag] = useState(null);
  const chartSurfaceRef = useRef(null);
  const dateDragRef = useRef(null);
  if (!data.length) return <EmptyState text="当前筛选条件下没有趋势数据" />;
  const highest = maxBy(data, 'totalTokens');
  const lowest = minBy(data, 'totalTokens');
  const hasSingleExtremum = highest?.date === lowest?.date;
  const hasTokenSeries = TREND_SERIES.some(({ key, yAxisId }) => yAxisId === 'tokens' && visibleSeries[key]);
  const tokenAxisStyle = getTrendAxisStyle(['totalTokens', 'cachedInputTokens'], hoveredSeries, '#6f665c');
  const costAxisStyle = getTrendAxisStyle(['costUsd'], hoveredSeries, '#8b7046');
  const outputAxisStyle = getTrendAxisStyle(['outputTokens'], hoveredSeries, '#3f6574');
  const renderedSeries = TREND_SERIES
    .filter(({ key }) => visibleSeries[key])
    .toSorted((left, right) => {
      const leftPriority = left.key === hoveredSeries ? 2 : left.key === 'outputTokens' ? 1 : 0;
      const rightPriority = right.key === hoveredSeries ? 2 : right.key === 'outputTokens' ? 1 : 0;
      return leftPriority - rightPriority;
    });

  function getPointerDate(event) {
    const surface = chartSurfaceRef.current;
    const svg = surface?.querySelector('svg');
    const plot = svg?.querySelector('defs > clipPath > rect');
    if (!surface || !plot) return null;

    const surfaceBounds = surface.getBoundingClientRect();
    const svgBounds = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const plotX = Number(plot.getAttribute('x'));
    const plotY = Number(plot.getAttribute('y'));
    const plotWidth = Number(plot.getAttribute('width'));
    const plotHeight = Number(plot.getAttribute('height'));
    if (!viewBox.width || !viewBox.height || !plotWidth || !plotHeight) return null;

    const scaleX = svgBounds.width / viewBox.width;
    const scaleY = svgBounds.height / viewBox.height;
    const left = svgBounds.left + ((plotX - viewBox.x) * scaleX);
    const top = svgBounds.top + ((plotY - viewBox.y) * scaleY);
    const width = plotWidth * scaleX;
    const height = plotHeight * scaleY;

    const ratio = Math.min(1, Math.max(0, (event.clientX - left) / width));
    const index = Math.round(ratio * (data.length - 1));
    return {
      date: data[index]?.date || '',
      x: left - surfaceBounds.left + (ratio * width),
      top: top - surfaceBounds.top,
      height,
    };
  }

  function startDateDrag(event) {
    if (event.button !== 0) return;
    const point = getPointerDate(event);
    if (!point?.date) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = {
      startDate: point.date,
      endDate: point.date,
      startX: point.x,
      endX: point.x,
      top: point.top,
      height: point.height,
    };
    dateDragRef.current = next;
    setDateDrag(next);
  }

  function updateDateDrag(event) {
    const point = getPointerDate(event);
    if (!dateDragRef.current || !point?.date) return;
    const next = { ...dateDragRef.current, endDate: point.date, endX: point.x };
    dateDragRef.current = next;
    setDateDrag(next);
  }

  function finishDateDrag(event) {
    const current = dateDragRef.current;
    if (!current) return;
    const point = getPointerDate(event);
    const endDate = point?.date || current.endDate;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dateDragRef.current = null;
    setDateDrag(null);
    if (!endDate || current.startDate === endDate) return;
    onSelectDateRange({
      startDate: current.startDate < endDate ? current.startDate : endDate,
      endDate: current.startDate < endDate ? endDate : current.startDate,
    });
  }

  function cancelDateDrag(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dateDragRef.current = null;
    setDateDrag(null);
  }

  return (
    <div className="chart-frame" onMouseLeave={() => onHoverSeries(null)}>
      <div
        className="trend-chart-surface"
        ref={chartSurfaceRef}
        onPointerDown={startDateDrag}
        onPointerMove={updateDateDrag}
        onPointerUp={finishDateDrag}
        onPointerCancel={cancelDateDrag}
      >
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ left: 4, right: 16, top: 34, bottom: 0 }}>
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
          {hasTokenSeries && <YAxis yAxisId="tokens" tickFormatter={(value) => compactTokenFmt.format(value)} width={56} {...tokenAxisStyle} />}
          {visibleSeries.costUsd && <YAxis yAxisId="cost" orientation="right" tickFormatter={(value) => usdAxisFmt.format(value)} width={48} {...costAxisStyle} />}
          {visibleSeries.outputTokens && <YAxis yAxisId="output" orientation="right" tickFormatter={(value) => compactTokenFmt.format(value)} width={56} {...outputAxisStyle} />}
          <Tooltip content={<ChartTooltip />} />
            {dateDrag && dateDrag.startDate !== dateDrag.endDate && (
              <ReferenceArea
                x1={dateDrag.startDate < dateDrag.endDate ? dateDrag.startDate : dateDrag.endDate}
                x2={dateDrag.startDate < dateDrag.endDate ? dateDrag.endDate : dateDrag.startDate}
                fill="#b66243"
                fillOpacity={0.18}
                stroke="#9f4d36"
                strokeOpacity={0.55}
                zIndex={10}
              />
            )}
          {renderedSeries.map((series) => {
            const isDimmed = Boolean(hoveredSeries && hoveredSeries !== series.key);
            return (
              <Area
                key={series.key}
                yAxisId={series.yAxisId}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={isDimmed ? '#bdb5ab' : series.color}
                fill={series.fill}
                strokeWidth={series.strokeWidth}
                strokeDasharray={series.strokeDasharray}
                strokeOpacity={isDimmed ? 0.12 : 1}
                fillOpacity={isDimmed ? 0.04 : 1}
                activeDot={{ r: 5, fill: series.color, onMouseEnter: () => onHoverSeries(series.key) }}
                onMouseEnter={() => onHoverSeries(series.key)}
              />
            );
          })}
          {visibleSeries.totalTokens && (!hoveredSeries || hoveredSeries === 'totalTokens') && highest && (
            <ReferenceDot x={highest.date} y={highest.totalTokens} yAxisId="tokens" r={5} fill="#9f4d36" stroke="#fffdf8" strokeWidth={2}>
              <Label value={`${hasSingleExtremum ? '最高/最低' : '最高'} ${compactTokenFmt.format(highest.totalTokens)}`} position="top" fill="#75402f" fontSize={12} fontWeight={700} />
            </ReferenceDot>
          )}
          {visibleSeries.totalTokens && (!hoveredSeries || hoveredSeries === 'totalTokens') && !hasSingleExtremum && lowest && (
            <ReferenceDot x={lowest.date} y={lowest.totalTokens} yAxisId="tokens" r={5} fill="#9f4d36" stroke="#fffdf8" strokeWidth={2}>
              <Label value={`最低 ${compactTokenFmt.format(lowest.totalTokens)}`} position="top" fill="#75402f" fontSize={12} fontWeight={700} />
            </ReferenceDot>
          )}
          </AreaChart>
        </ResponsiveContainer>
        {dateDrag && Math.abs(dateDrag.endX - dateDrag.startX) > 1 && (
          <div
            className="trend-date-selection"
            style={{
              left: `${Math.min(dateDrag.startX, dateDrag.endX)}px`,
              top: `${dateDrag.top}px`,
              width: `${Math.abs(dateDrag.endX - dateDrag.startX)}px`,
              height: `${dateDrag.height}px`,
            }}
          />
        )}
      </div>
      <div className="chart-legend" onMouseLeave={() => onHoverSeries(null)}>
        {TREND_SERIES.map((series) => (
          <button
            className={`chart-legend-button ${visibleSeries[series.key] ? '' : 'is-hidden'} ${hoveredSeries === series.key ? 'is-highlighted' : ''}`}
            key={series.key}
            type="button"
            aria-pressed={visibleSeries[series.key]}
            onClick={() => onToggleSeries(series.key)}
            onMouseEnter={() => visibleSeries[series.key] && onHoverSeries(series.key)}
            title={`${visibleSeries[series.key] ? '隐藏' : '显示'}${series.label}`}
          >
            <i className={series.strokeDasharray ? 'dash' : ''} style={series.strokeDasharray ? undefined : { background: series.color }} />
            {series.label}
          </button>
        ))}
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
          <XAxis type="number" tickFormatter={(value) => compactTokenFmt.format(value)} tick={{ fill: '#6f665c', fontSize: 12 }} />
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
      <strong>{row.date ? formatDateWithWeekday(row.date) : label || row.model}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>
          {item.name || item.dataKey}: {formatTooltipValue(item.dataKey, item.value)}
        </span>
      ))}
      {row.costUsd != null && !payload.some((item) => item.dataKey === 'costUsd') && <span>Cost: {usdFmt.format(row.costUsd)}</span>}
      {row.reasoningEffortBreakdown?.length > 0 && (
        <GroupBreakdown title="思考级别" rows={row.reasoningEffortBreakdown} getLabel={(entry) => reasoningEffortLabel(entry.reasoningEffort)} />
      )}
    </div>
  );
}

function GroupBreakdown({ title, rows, getLabel }) {
  return (
    <div className="group-breakdown">
      <b>{title}</b>
      {rows.slice(0, 6).map((row) => (
        <span key={getLabel(row)}>
          <span>{getLabel(row)}</span>
          <span>{compactTokenFmt.format(row.totalTokens)} · {Math.round(row.share * 100)}%</span>
        </span>
      ))}
    </div>
  );
}

function Heatmap({ data, selectedStart, selectedEnd }) {
  const [hoveredCell, setHoveredCell] = useState(null);
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
              onMouseEnter={() => setHoveredCell(cell)}
              onMouseLeave={() => setHoveredCell(null)}
            />
          ))}
        </div>
      </div>
      {hoveredCell && <HeatmapTooltip cell={hoveredCell} />}
      <div className="heatmap-footer">
        <span>{startDate} 至 {endDate}</span>
        <div className="heatmap-legend">
          <span>少</span>
          {Array.from({ length: HEAT_LEVEL_THRESHOLDS.length + 2 }, (_, level) => level).map((level) => (
            <i key={level} className={`heat-${level}`} />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  );
}

function HeatmapTooltip({ cell }) {
  return (
    <div className="heatmap-tooltip" role="tooltip">
      <strong>{formatDateWithWeekday(cell.date)}</strong>
      <span>总计: {numberFmt.format(cell.totalTokens)} tokens</span>
      <span>缓存: {numberFmt.format(cell.cachedInputTokens)} tokens</span>
      <span>输出: {numberFmt.format(cell.outputTokens)} tokens</span>
      <span>估算: {usdFmt.format(cell.costUsd)}</span>
    </div>
  );
}

function RankList({ rows, kind }) {
  if (!rows.length) return <EmptyState text="没有项目数据" />;
  return (
    <div className="rank-list">
      {rows.slice(0, 8).map((row, index) => (
        <div className="rank-row" key={row.cwd || row.model || row.reasoningEffort} title={kind === 'project' ? row.cwd : undefined}>
          <span className="rank-index">{index + 1}</span>
          <div>
            <strong>{kind === 'project' ? row.projectName : kind === 'reasoningEffort' ? reasoningEffortLabel(row.reasoningEffort) : row.model}</strong>
            <small>{compactTokenFmt.format(row.totalTokens)} tokens · {usdFmt.format(row.costUsd)}</small>
          </div>
          <div className="rank-bar"><span style={{ width: `${row.share * 100}%` }} /></div>
          {kind === 'reasoningEffort' && row.modelBreakdown?.length > 0 && (
            <GroupBreakdown title="模型" rows={row.modelBreakdown} getLabel={(entry) => entry.model} />
          )}
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
  const scopeLabel = raw?.scan?.state === 'complete' ? '全量历史' : '近一周';
  return (
    <div className="status-stack">
      <div className="status-line">
        <FolderGit2 size={17} />
        <span>{scopeLabel}：{analytics.sessions.length} 个会话，{analytics.models.length} 个模型，{analytics.projects.length} 个项目路径。</span>
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

function HistoryLoading() {
  return (
    <div className="history-loading" role="status">
      <RefreshCw size={22} className="spin" />
      <span>正在汇总全量历史日志</span>
    </div>
  );
}

function fillDefaultDateRange(current, events) {
  if (current.startDate || current.endDate || !events.length) return current;
  return {
    ...current,
    datePreset: 'lastWeek',
    ...getDateRangePreset('lastWeek'),
  };
}

function rangeExtendsBeyondRecentWeek(filters, scan) {
  if (!scan?.recentStartDate) return false;
  const recentEndDate = shanghaiToday();
  return !filters.startDate
    || !filters.endDate
    || filters.startDate < scan.recentStartDate
    || filters.endDate > recentEndDate;
}

function getDateRangePreset(preset) {
  if (!preset || preset === 'all') return { startDate: '', endDate: '' };
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
  const models = sortModels([...new Set(events.map((event) => event.model || 'unknown'))]);
  const reasoningEfforts = [...new Set(events.map((event) => normalizeReasoningEffort(event.reasoningEffort)))].sort(
    (left, right) => reasoningEffortSortOrder(left) - reasoningEffortSortOrder(right)
  );
  const cwdList = [...new Map(events.map((event) => [
    event.cwd || 'unknown',
    projectLabels.get(event.cwd || 'unknown') || event.projectName || projectNameFromPath(event.cwd || 'unknown'),
  ]))].sort((a, b) => a[1].localeCompare(b[1], 'zh-CN'));
  return {
    models: [['all', '全部模型'], ...models.map((model) => [model, model])],
    reasoningEfforts: [['all', '全部思考级别'], ...reasoningEfforts.map((effort) => [effort, reasoningEffortLabel(effort)])],
    cwdList: [['all', '全部项目'], ...cwdList],
  };
}

function applyFilters(events, filters) {
  return events.filter((event) => {
    if (CLIENT_SOURCE_FILTERS.has(filters.source) && event.client !== filters.source) return false;
    if (filters.source !== 'all' && !CLIENT_SOURCE_FILTERS.has(filters.source) && event.source !== filters.source) return false;
    if (filters.model !== 'all' && event.model !== filters.model) return false;
    if (filters.reasoningEffort !== 'all' && normalizeReasoningEffort(event.reasoningEffort) !== filters.reasoningEffort) return false;
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
  const reasoningEfforts = new Map();
  const modelEfforts = new Map();
  const effortModels = new Map();
  const sessions = new Map();
  const total = emptyTotals();

  for (const event of events) {
    const costUsd = estimateCost(event, prices);
    addTo(total, event, costUsd);
    addToMap(daily, event.date, event, costUsd, { date: event.date });
    addToMap(models, event.model, event, costUsd, { model: event.model });
    const reasoningEffort = normalizeReasoningEffort(event.reasoningEffort);
    addToMap(reasoningEfforts, reasoningEffort, event, costUsd, { reasoningEffort });
    addToNestedMap(modelEfforts, event.model, reasoningEffort, event, costUsd, { reasoningEffort });
    addToNestedMap(effortModels, reasoningEffort, event.model, event, costUsd, { model: event.model });
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
  const modelRows = withShares([...models.values()].sort((a, b) => b.totalTokens - a.totalTokens)).map((row) => ({
    ...row,
    reasoningEffortBreakdown: buildBreakdownRows(modelEfforts.get(row.model)),
  }));
  const projectRows = withShares([...projects.values()].sort((a, b) => b.totalTokens - a.totalTokens));
  const reasoningEffortRows = withShares([...reasoningEfforts.values()].sort((a, b) => b.totalTokens - a.totalTokens)).map((row) => ({
    ...row,
    modelBreakdown: buildBreakdownRows(effortModels.get(row.reasoningEffort)),
  }));
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
    reasoningEfforts: reasoningEffortRows,
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

function addToNestedMap(groups, groupKey, nestedKey, event, costUsd, base) {
  if (!groups.has(groupKey)) groups.set(groupKey, new Map());
  addToMap(groups.get(groupKey), nestedKey, event, costUsd, base);
}

function buildBreakdownRows(groups) {
  const rows = [...(groups?.values() || [])].sort((left, right) => right.totalTokens - left.totalTokens);
  const totalTokens = rows.reduce((total, row) => total + row.totalTokens, 0);
  return rows.map((row) => ({ ...row, share: totalTokens ? row.totalTokens / totalTokens : 0 }));
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
      value: compactTokenFmt.format(topDay?.totalTokens || 0),
      detail: `${topDay?.date || '-'} · ${numberFmt.format(topDay?.totalTokens || 0)} tokens`,
    },
    {
      label: '最高成本日',
      value: usdFmt.format(topCostDay?.costUsd || 0),
      detail: `${topCostDay?.date || '-'} · ${compactTokenFmt.format(topCostDay?.totalTokens || 0)} tokens`,
    },
    {
      label: '缓存命中最高会话',
      value: `${Math.round((topCacheRateSession?.cacheRate || 0) * 100)}%`,
      detail: `${topCacheRateSession?.sessionName || '-'} · ${compactTokenFmt.format(topCacheRateSession?.cachedInputTokens || 0)} cached`,
    },
    {
      label: '最高单会话',
      value: compactTokenFmt.format(topSession?.totalTokens || 0),
      detail: `${topSession?.sessionName || '-'} · ${usdFmt.format(topSession?.costUsd || 0)}`,
    },
    {
      label: '最高输出日',
      value: compactTokenFmt.format(topOutputDay?.outputTokens || 0),
      detail: `${topOutputDay?.date || '-'} · output tokens`,
    },
    {
      label: '最活跃项目',
      value: topProject?.projectName || '-',
      detail: `${compactTokenFmt.format(topProject?.totalTokens || 0)} tokens · ${usdFmt.format(topProject?.costUsd || 0)}`,
    },
  ];
}

function maxBy(rows, field) {
  return rows.reduce((best, row) => (!best || row[field] > best[field] ? row : best), null);
}

function minBy(rows, field) {
  return rows.reduce((best, row) => (!best || row[field] < best[field] ? row : best), null);
}

function normalizeReasoningEffort(value) {
  const effort = String(value || '').toLowerCase();
  return REASONING_EFFORT_LABELS[effort] ? effort : 'unknown';
}

function reasoningEffortLabel(value) {
  return REASONING_EFFORT_LABELS[normalizeReasoningEffort(value)];
}

function reasoningEffortSortOrder(value) {
  return ['xhigh', 'high', 'medium', 'low', 'none', 'unknown'].indexOf(value);
}

function sortModels(models) {
  const available = new Set(models);
  const unspecified = models
    .filter((model) => model !== 'unknown' && !FIXED_MODEL_ORDER.includes(model))
    .sort((left, right) => right.localeCompare(left));
  const ordered = [];

  for (const fixedModel of FIXED_MODEL_ORDER) {
    while (unspecified.length && unspecified[0].localeCompare(fixedModel) > 0) {
      ordered.push(unspecified.shift());
    }
    if (available.has(fixedModel)) ordered.push(fixedModel);
  }

  ordered.push(...unspecified);
  if (available.has('unknown')) ordered.push('unknown');
  return ordered;
}

function getTrendAxisStyle(seriesKeys, hoveredSeries, color) {
  const isDimmed = Boolean(hoveredSeries && !seriesKeys.includes(hoveredSeries));
  const opacity = isDimmed ? 0.16 : 1;
  return {
    tick: { fill: color, fillOpacity: opacity, fontSize: 12 },
    axisLine: { stroke: color, strokeOpacity: opacity },
    tickLine: { stroke: color, strokeOpacity: opacity },
  };
}

function formatTooltipValue(dataKey, value) {
  if (dataKey === 'costUsd') return usdFmt.format(value || 0);
  return numberFmt.format(value || 0);
}

function formatDateWithWeekday(date) {
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getUTCDay()];
  return `${date} 周${weekday}`;
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
    cells.push({
      ...emptyTotals(),
      ...byDate.get(date),
      date,
      totalTokens: byDate.get(date)?.totalTokens || 0,
    });
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
  const values = cells.map((cell) => cell.totalTokens).filter(Boolean).sort((a, b) => a - b);
  const levels = new Map();

  for (const cell of cells) {
    if (!cell.totalTokens) {
      levels.set(cell.date, 0);
      continue;
    }
    const rank = values.findLastIndex((value) => value <= cell.totalTokens) + 1;
    const percentile = rank / values.length;
    const level = HEAT_LEVEL_THRESHOLDS.findIndex((threshold) => percentile <= threshold) + 1;
    levels.set(cell.date, level || HEAT_LEVEL_THRESHOLDS.length + 1);
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
