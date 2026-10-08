import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceDot,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Database,
  ExternalLink,
  FolderGit2,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { millisecondsUntilNextHour } from './hourlyRefresh.js';
import { areTrendValuesEqual, getTrendAxisConfig, getTrendExtrema, getTrendReferenceMaximum } from './trendAxis.js';
import './styles.css';

const DEFAULT_PRICES = {
  gpt6Astra: {
    label: 'GPT-6 Astra',
    input: 10,
    cached: 1,
    output: 50,
    url: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
  },
  gpt61Sol: {
    label: 'GPT-6.1 Sol',
    input: 2,
    cached: 0.1,
    output: 10,
    url: 'https://developers.openai.com/api/docs/models/gpt-6.1-sol',
  },
  gpt6Sol: {
    label: 'GPT-6 Sol',
    input: 2,
    cached: 0.2,
    output: 10,
    url: 'https://developers.openai.com/api/docs/models/gpt-6-sol',
  },
  gpt6Luna: {
    label: 'GPT-6 Luna',
    input: 0.1,
    cached: 0.01,
    output: 0.5,
    url: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
  },
  gpt56Sol: {
    label: 'GPT-5.6 Sol',
    input: 4,
    cached: 0.4,
    output: 20,
    url: 'https://developers.openai.com/api/docs/models/gpt-5.6-sol',
  },
  gpt56Terra: {
    label: 'GPT-5.6 Terra',
    input: 2,
    cached: 0.2,
    output: 12,
    url: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra',
  },
  gpt56Luna: {
    label: 'GPT-5.6 Luna',
    input: 0.2,
    cached: 0.02,
    output: 1.2,
    url: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
  },
  gpt55: {
    label: 'GPT-5.5',
    input: 5,
    cached: 0.5,
    output: 30,
    url: 'https://developers.openai.com/api/docs/models/gpt-5.5',
  },
  gpt54: {
    label: 'GPT-5.4',
    input: 2.5,
    cached: 0.25,
    output: 15,
    url: 'https://developers.openai.com/api/docs/models/gpt-5.4',
  },
  gpt54Mini: {
    label: 'GPT-5.4 mini',
    input: 0.75,
    cached: 0.075,
    output: 4.5,
    url: 'https://developers.openai.com/api/docs/models/gpt-5.4-mini',
  },
};

const MODEL_MAP = {
  'gpt-6-astra': 'gpt6Astra',
  'gpt-6.1-sol': 'gpt61Sol',
  'gpt-6-sol': 'gpt6Sol',
  'gpt-6-luna': 'gpt6Luna',
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
const cnyFmt = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});
const HEAT_LEVEL_THRESHOLDS = [0.1, 0.2, 0.3, 0.4, 0.52, 0.65, 0.76, 0.86, 0.94];
const TREND_COLORS = {
  total: '#9f4d36',
  cached: '#c96442',
  output: '#3f6574',
  cost: '#b98b45',
};
const TREND_AXIS_IDS = {
  tokens: 'tokens',
  output: 'right-1-output',
  cost: 'right-2-cost',
};
const TREND_SERIES = [
  { key: 'totalTokens', label: 'Total', color: TREND_COLORS.total, fill: 'url(#tokenFill)', strokeWidth: 2.5, yAxisId: TREND_AXIS_IDS.tokens },
  { key: 'cachedInputTokens', label: 'Cached', color: TREND_COLORS.cached, fill: 'transparent', strokeWidth: 1.8, yAxisId: TREND_AXIS_IDS.tokens },
  { key: 'outputTokens', label: 'Output', color: TREND_COLORS.output, fill: 'transparent', strokeWidth: 1.8, yAxisId: TREND_AXIS_IDS.output },
  { key: 'costUsd', label: 'Cost', color: TREND_COLORS.cost, fill: 'url(#costFill)', strokeWidth: 2, yAxisId: TREND_AXIS_IDS.cost, strokeDasharray: '4 4' },
];
const TREND_AXIS_SERIES = {
  tokens: ['totalTokens', 'cachedInputTokens'],
  output: ['outputTokens'],
  cost: ['costUsd'],
};
const REASONING_EFFORT_LABELS = {
  low: '低 (low)',
  medium: '中 (medium)',
  high: '高 (high)',
  xhigh: '超高 (xhigh)',
  none: '关闭 (none)',
  unknown: '未知 (unknown)',
};
const FIXED_MODEL_ORDER = [
  'gpt-6-astra',
  'gpt-6.1-sol',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
];
const DATE_PRESET_GROUPS = [
  {
    label: '日历范围',
    options: [
      ['today', '今日'],
      ['thisWeek', '本周'],
      ['thisMonth', '本月'],
      ['thisYear', '本年'],
      ['all', '全部'],
      ['', '自定义'],
    ],
  },
  {
    label: '滚动范围',
    options: [
      ['lastWeek', '近一周'],
      ['lastHalfMonth', '近半月'],
      ['lastMonth', '近一月'],
      ['lastQuarter', '近三月'],
      ['lastHalfYear', '近半年'],
      ['lastYear', '近一年'],
    ],
  },
];
const DATE_PRESET_LABELS = Object.fromEntries(
  DATE_PRESET_GROUPS.flatMap(({ options }) => options)
);
const DATE_SELECTION_KEY = 'codex-token-dashboard-date-selection';

function App() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState(() => ({
    source: 'all',
    model: 'all',
    reasoningEffort: 'all',
    cwd: 'all',
    ...(readSavedDateSelection() || { datePreset: 'lastWeek', ...getDateRangePreset('lastWeek') }),
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [fxRate, setFxRate] = useState(7.2);
  const [visibleTrendSeries, setVisibleTrendSeries] = useState(getDefaultTrendSeriesVisibility);
  const [hoveredTrendSeries, setHoveredTrendSeries] = useState(null);
  const refreshTimerRef = useRef(null);
  const hourlyRefreshTimerRef = useRef(null);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(DATE_SELECTION_KEY, JSON.stringify({
        datePreset: filters.datePreset,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }));
    } catch {
      // The dashboard still works when browser storage is unavailable.
    }
  }, [filters.datePreset, filters.startDate, filters.endDate]);
  const isMobile = useMediaQuery('(max-width: 720px)');
  const isTodayPreset = filters.datePreset === 'today';
  const loadUsage = useCallback(async ({ refresh = false, background = false } = {}) => {
    const currentFilters = filtersRef.current;
    const dateRange = refresh && currentFilters.datePreset && currentFilters.datePreset !== 'all'
      ? getDateRangePreset(currentFilters.datePreset)
      : { startDate: currentFilters.startDate, endDate: currentFilters.endDate };
    const refreshRequest = refresh
      ? getCoverageRequest({ ...currentFilters, ...dateRange })
      : null;
    if (refresh && currentFilters.datePreset && currentFilters.datePreset !== 'all') {
      setFilters((current) => current.datePreset === currentFilters.datePreset
        ? { ...current, ...dateRange }
        : current);
    }
    if (!background) {
      setError('');
      refresh ? setRefreshing(true) : setLoading(true);
    }
    try {
      const response = await fetch(refresh ? '/api/refresh' : '/api/usage', {
        method: refresh ? 'POST' : 'GET',
        headers: refreshRequest ? { 'Content-Type': 'application/json' } : undefined,
        body: refreshRequest ? JSON.stringify(refreshRequest) : undefined,
      });
      if (!response.ok) throw new Error(getApiErrorMessage(response, refresh ? '刷新日志' : '读取日志'));
      const data = await response.json();
      setRaw(data);
      setFilters((current) => fillDefaultDateRange(current, data.events || [], data.scan));
    } catch (err) {
      setError(`读取 Codex 日志失败：${err.message}`);
    } finally {
      if (!background) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const requestCoverage = useCallback(async (request) => {
    setError('');
    try {
      const response = await fetch(request.all ? '/api/scan-all' : '/api/scan-range', {
        method: 'POST',
        headers: request.all ? undefined : { 'Content-Type': 'application/json' },
        body: request.all ? undefined : JSON.stringify(request),
      });
      if (!response.ok) throw new Error(getApiErrorMessage(response, '扩展日志范围'));
      const data = await response.json();
      setRaw(data);
      setFilters((current) => fillDefaultDateRange(current, data.events || [], data.scan));
    } catch (err) {
      setError(`扩展日志范围失败：${err.message}`);
    }
  }, []);

  const updateDateRange = useCallback((nextFilters) => setFilters(nextFilters), []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    setRefreshing(true);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void loadUsage({ refresh: true });
    }, 350);
  }, [loadUsage]);

  const toggleTrendSeries = useCallback((key) => {
    setVisibleTrendSeries((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadUsage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsage]);

  useEffect(() => () => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    const scheduleNextRefresh = () => {
      hourlyRefreshTimerRef.current = window.setTimeout(async () => {
        hourlyRefreshTimerRef.current = null;
        if (!active) return;
        await loadUsage({ refresh: true, background: true });
        if (active) scheduleNextRefresh();
      }, millisecondsUntilNextHour());
    };
    scheduleNextRefresh();
    return () => {
      active = false;
      if (hourlyRefreshTimerRef.current) window.clearTimeout(hourlyRefreshTimerRef.current);
    };
  }, [loadUsage]);

  const coverageRequest = useMemo(() => getCoverageRequest(filters), [filters]);
  const scanState = raw?.scan?.state;
  const coverage = raw?.scan?.coverage;
  useEffect(() => {
    if (!raw || scanState === 'scanning' || !coverageRequest) return;
    if (!isCoverageRequestSatisfied(coverageRequest, coverage)) {
      const timer = window.setTimeout(() => void requestCoverage(coverageRequest), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [coverage, coverageRequest, raw, requestCoverage, scanState]);

  useEffect(() => {
    if (raw?.scan?.state !== 'scanning') return undefined;
    const timer = window.setTimeout(() => loadUsage({ background: true }), 1000);
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
  const selectedRangeIncludesToday = isDateInSelectedRange(shanghaiToday(), filters);
  const analytics = useMemo(
    () => buildAnalytics(filteredEvents, prices, projectLabels, {
      includeToday: selectedRangeIncludesToday,
    }),
    [filteredEvents, prices, projectLabels, selectedRangeIncludesToday]
  );
  const allAnalytics = useMemo(
    () => buildAnalytics(events, prices, projectLabels),
    [events, prices, projectLabels]
  );
  const hasFullHistory = coverage?.all === true;
  const isRangeScanPending = scanState === 'scanning';
  const activeFilterCount = [
    filters.source !== 'all',
    filters.model !== 'all',
    filters.reasoningEffort !== 'all',
    filters.cwd !== 'all',
    Boolean(filters.startDate || filters.endDate),
  ].filter(Boolean).length;

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
          <div className="title-line">
            <h1>Token 用量看板</h1>
            <p className="subtle">
              按 last_token_usage 聚合，金额按 OpenAI API 公开价格估算。
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={() => setSettingsOpen(!settingsOpen)} title="设置">
            <Settings2 size={18} />
          </button>
          {raw?.scan?.state === 'ready' && !hasFullHistory && (
            <div className="history-load-control">
              <span className="coverage-tooltip" id="history-load-coverage" role="tooltip">
                {formatCoverageLabel(coverage)}已就绪；切换更长的日期范围时只会扫描尚未加载的日期。
              </span>
              <button
                className="secondary-button"
                aria-describedby="history-load-coverage"
                onClick={() => requestCoverage({ all: true })}
              >
                <Database size={17} />
                加载全部历史
              </button>
            </div>
          )}
          <button className="primary-button" onClick={scheduleRefresh} disabled={isRangeScanPending}>
            <RefreshCw size={17} className={(refreshing || isRangeScanPending) ? 'spin' : ''} />
            {isRangeScanPending ? '扫描中' : refreshing ? '准备刷新' : '刷新数据'}
          </button>
        </div>
      </header>

      {error && (
        <Notice tone="danger" icon={<AlertTriangle size={18} />}>
          {error}
        </Notice>
      )}

      {raw?.scan?.state === 'scanning' && (
        <Notice tone="warn" icon={<RefreshCw size={18} className="spin" />}>
          <span>正在{formatScanRequestLabel(raw.scan.request)}，当前已加载的数据仍可使用。</span>
          <InlineScanProgress scan={raw.scan} />
        </Notice>
      )}

      {raw?.scan?.state === 'failed' && (
        <Notice tone="warn" icon={<AlertTriangle size={18} />}>
          <span>日志扫描失败：{raw.scan.error}</span>
          <button className="notice-button" onClick={() => requestCoverage(coverageRequest || { all: true })}>重新尝试</button>
        </Notice>
      )}

      <button
        className="filter-toggle"
        type="button"
        aria-expanded={mobileFiltersOpen}
        aria-controls="dashboard-filters"
        onClick={() => setMobileFiltersOpen((current) => !current)}
      >
        <span><SlidersHorizontal size={17} />筛选条件</span>
        <span className="filter-toggle-state">
          {activeFilterCount ? `${activeFilterCount} 项生效` : '全部数据'}
          <ChevronDown className={mobileFiltersOpen ? 'is-open' : ''} size={17} />
        </span>
      </button>

      <section
        className={`filter-strip ${mobileFiltersOpen ? 'is-mobile-open' : ''}`}
        id="dashboard-filters"
      >
        <Select
          label="范围"
          value={filters.source}
          onChange={(source) => setFilters({ ...filters, source })}
          options={[
            ['all', '全部'],
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

      <section className="kpi-grid">
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
          label={isTodayPreset ? '今日输出' : '平均每日'}
          value={compactTokenFmt.format(isTodayPreset ? analytics.today.outputTokens : analytics.averageDailyTokens)}
          detail={isTodayPreset
            ? `${numberFmt.format(analytics.today.outputTokens)} output tokens`
            : `${analytics.days.length} 个有效日期`}
        />
        <KpiCard
          icon={<Sparkles size={18} />}
          label="缓存命中率"
          value={`${Math.round(analytics.cacheRate * 100)}%`}
          detail={`${compactTokenFmt.format(analytics.total.cachedInputTokens)} cached`}
        />
        <KpiCard
          icon={<Database size={18} />}
          label={hasFullHistory ? '历史总量' : '已加载总量'}
          value={compactTokenFmt.format(allAnalytics.total.totalTokens)}
          detail={`${numberFmt.format(allAnalytics.total.totalTokens)} tokens`}
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label={hasFullHistory ? '历史估算金额' : '已加载估算金额'}
          value={compactUsdFmt.format(allAnalytics.total.costUsd)}
          detail={cnyFmt.format(allAnalytics.total.costUsd * fxRate)}
        />
      </section>

      <section className="main-grid">
        <Panel
          className="trend-panel"
          title={isTodayPreset ? '今日走势' : '每日趋势'}
          meta={isTodayPreset ? '今日 Total Token、Output 与预估成本' : '每日 Total Token、Output 与预估成本'}
        >
          <TrendChart
            data={analytics.days}
            visibleSeries={visibleTrendSeries}
            onToggleSeries={toggleTrendSeries}
            hoveredSeries={hoveredTrendSeries}
            onHoverSeries={setHoveredTrendSeries}
            onSelectDateRange={(range) => updateDateRange({ ...filters, ...range, datePreset: '' })}
            isMobile={isMobile}
            showExtrema={!isTodayPreset}
          />
        </Panel>
        <Panel title="用量热力图" meta="按北京时间统计每日用量">
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

function InlineScanProgress({ scan }) {
  const progress = scan?.progress;
  const totalFiles = progress?.totalFiles || 0;
  const processedFiles = progress?.processedFiles || 0;
  const percent = totalFiles ? Math.min(100, Math.round((processedFiles / totalFiles) * 100)) : 0;
  const progressLabel = totalFiles
    ? `已扫描 ${numberFmt.format(processedFiles)} / ${numberFmt.format(totalFiles)} 个日志文件`
    : '正在整理待扫描的日志文件';

  return (
    <div className="inline-scan-progress" role="status" aria-live="polite" aria-label={progressLabel}>
      <div className="scan-progress-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <span>{progressLabel} ({percent}%)</span>
    </div>
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
  const inputRef = useRef(null);

  const openDatePicker = () => {
    inputRef.current?.focus();
    inputRef.current?.showPicker?.();
  };

  return (
    <label className="field date-field">
      <span>{label}</span>
      <div className="date-input-control">
        <input ref={inputRef} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        <button className="date-picker-button" type="button" aria-label={`选择${label}日期`} onClick={openDatePicker}>
          <CalendarDays size={16} aria-hidden="true" />
        </button>
      </div>
    </label>
  );
}

function DatePresetField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePress = (event) => {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="field date-preset-field" ref={fieldRef}>
      <span>快捷范围</span>
      <button
        className="date-preset-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {DATE_PRESET_LABELS[value] || '自定义'}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="date-preset-menu" role="menu" aria-label="快捷范围">
          {DATE_PRESET_GROUPS.map((group) => (
            <section className="date-preset-group" key={group.label}>
              <h3>{group.label}</h3>
              <div>
                {group.options.map(([preset, label]) => (
                  <button
                    className={value === preset ? 'is-selected' : ''}
                    key={preset || 'custom'}
                    type="button"
                    role="menuitemradio"
                    aria-checked={value === preset}
                    onClick={() => {
                      onChange(preset);
                      setOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
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
            <div className="price-box-header">
              <strong>{price.label}</strong>
              <a href={price.url} target="_blank" rel="noopener noreferrer" title={`${price.label} 官方价格`} aria-label={`${price.label} 官方价格`}>
                <ExternalLink size={16} aria-hidden="true" />
              </a>
            </div>
            <label>Input <input value={price.input} type="number" step="0.001" onChange={(event) => updatePrice(key, 'input', event.target.value)} /></label>
            <label>Cached <input value={price.cached} type="number" step="0.001" onChange={(event) => updatePrice(key, 'cached', event.target.value)} /></label>
            <label>Output <input value={price.output} type="number" step="0.001" onChange={(event) => updatePrice(key, 'output', event.target.value)} /></label>
          </div>
        ))}
        <div className="price-box mapping-box">
          <strong>模型映射</strong>
          <p>gpt-6-astra → GPT-6 Astra</p>
          <p>gpt-6.1-sol → GPT-6.1 Sol</p>
          <p>gpt-6-sol → GPT-6 Sol</p>
          <p>gpt-6-luna → GPT-6 Luna</p>
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

function TrendChart({ data, visibleSeries, onToggleSeries, hoveredSeries, onHoverSeries, onSelectDateRange, isMobile, showExtrema }) {
  const [dateDrag, setDateDrag] = useState(null);
  const [axisHitZones, setAxisHitZones] = useState([]);
  const [hoveredExtremum, setHoveredExtremum] = useState(null);
  const chartSurfaceRef = useRef(null);
  const dateDragRef = useRef(null);
  const hasTokenSeries = TREND_SERIES.some(({ key, yAxisId }) => yAxisId === TREND_AXIS_IDS.tokens && visibleSeries[key]);
  const tokenAxisStyle = getTrendAxisStyle(TREND_AXIS_SERIES.tokens, hoveredSeries, TREND_COLORS.total);
  const costAxisStyle = getTrendAxisStyle(TREND_AXIS_SERIES.cost, hoveredSeries, TREND_COLORS.cost, true);
  const outputAxisStyle = getTrendAxisStyle(TREND_AXIS_SERIES.output, hoveredSeries, TREND_COLORS.output);
  const totalAxisMaximum = getTrendReferenceMaximum(data);
  // All three scales use the same Total-derived reference: Output is Total / 100;
  // Cost is Total per million tokens, so K, M and B become 0.001x, 1x and 1,000x.
  const tokenAxis = getTrendAxisConfig(data, 'totalTokens', totalAxisMaximum, false, TREND_COLORS.total, tokenAxisStyle.tick.fillOpacity);
  const outputAxis = getTrendAxisConfig(data, 'outputTokens', totalAxisMaximum / 100, false, TREND_COLORS.output, outputAxisStyle.tick.fillOpacity);
  const costAxis = getTrendAxisConfig(data, 'costUsd', totalAxisMaximum / 1_000_000, true, TREND_COLORS.cost, costAxisStyle.tick.fillOpacity);
  const extremumMarkers = (showExtrema ? TREND_SERIES : [])
    .filter(({ key }) => key !== 'cachedInputTokens' && visibleSeries[key] && (!isMobile || key === 'totalTokens'))
    .map((series) => ({ series, extrema: getTrendExtrema(data, series.key) }));
  const renderedSeries = TREND_SERIES
    .filter(({ key }) => visibleSeries[key])
    .toSorted((left, right) => {
      const leftPriority = hoveredSeries
        ? (isTrendSeriesHighlighted(hoveredSeries, left.key) ? 2 : 0)
        : left.key === 'outputTokens' ? 1 : 0;
      const rightPriority = hoveredSeries
        ? (isTrendSeriesHighlighted(hoveredSeries, right.key) ? 2 : 0)
        : right.key === 'outputTokens' ? 1 : 0;
      return leftPriority - rightPriority;
    });

  useEffect(() => {
    const surface = chartSurfaceRef.current;
    if (!surface) return undefined;
    if (isMobile) return undefined;

    let frame = 0;
    const measure = () => {
      const nextZones = getTrendAxisHitZones(surface);
      setAxisHitZones((currentZones) => areTrendAxisHitZonesEqual(currentZones, nextZones) ? currentZones : nextZones);
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(surface);
    const svg = surface.querySelector('svg');
    const mutationObserver = svg ? new MutationObserver(scheduleMeasure) : null;
    mutationObserver?.observe(svg, { childList: true, subtree: true, attributes: true, attributeFilter: ['x1', 'x2', 'width', 'transform'] });
    scheduleMeasure();
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [data, isMobile, visibleSeries.costUsd, visibleSeries.outputTokens]);

  if (!data.length) return <EmptyState text="当前筛选条件下没有趋势数据" />;

  function clearTrendHover() {
    setHoveredExtremum(null);
    onHoverSeries(null);
  }

  function activateTrendSeries(seriesKey) {
    setHoveredExtremum(null);
    onHoverSeries(seriesKey);
  }

  function activateExtremum(extremum) {
    setHoveredExtremum(extremum);
    onHoverSeries(extremum.seriesKey);
  }

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
    if (!dateDragRef.current) return;
    const point = getPointerDate(event);
    if (!point?.date) return;
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
    <div className="chart-frame" onMouseLeave={clearTrendHover}>
      <TrendMobileSummary data={data} />
      <div
        className={`trend-chart-surface ${isMobile ? 'is-mobile' : ''}`}
        ref={chartSurfaceRef}
        onPointerDown={isMobile ? undefined : startDateDrag}
        onPointerMove={isMobile ? undefined : updateDateDrag}
        onPointerUp={isMobile ? undefined : finishDateDrag}
        onPointerCancel={isMobile ? undefined : cancelDateDrag}
      >
        <ResponsiveContainer width="100%" height={isMobile ? 264 : 300}>
          <AreaChart data={data} margin={isMobile
            ? { left: 4, right: 2, top: 28, bottom: 0 }
            : { left: 4, right: 16, top: 34, bottom: 0 }}>
          <defs>
            <linearGradient id="tokenFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TREND_COLORS.total} stopOpacity={0.42} />
              <stop offset="100%" stopColor={TREND_COLORS.total} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TREND_COLORS.cost} stopOpacity={0.34} />
              <stop offset="100%" stopColor={TREND_COLORS.cost} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e4ddd2" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6f665c', fontSize: isMobile ? 11 : 12 }}
            tickFormatter={isMobile ? formatShortDate : undefined}
            tickMargin={10}
            minTickGap={isMobile ? 22 : 5}
            interval={isMobile ? 'preserveStartEnd' : undefined}
          />
          {hasTokenSeries && <YAxis className="trend-axis trend-axis-tokens" yAxisId={TREND_AXIS_IDS.tokens} domain={tokenAxis.domain} ticks={tokenAxis.ticks} interval={0} allowDataOverflow width={isMobile ? 52 : 56} {...tokenAxisStyle} tick={<TrendAxisTick axis={tokenAxis} orientation="left" compact={isMobile} />} />}
          {visibleSeries.outputTokens && <YAxis hide={isMobile} className="trend-axis trend-axis-output" yAxisId={TREND_AXIS_IDS.output} domain={outputAxis.domain} ticks={outputAxis.ticks} interval={0} allowDataOverflow orientation="right" width={isMobile ? 0 : 56} {...outputAxisStyle} tick={<TrendAxisTick axis={outputAxis} orientation="right" />} />}
          {visibleSeries.costUsd && <YAxis hide={isMobile} className="trend-axis trend-axis-cost" yAxisId={TREND_AXIS_IDS.cost} domain={costAxis.domain} ticks={costAxis.ticks} interval={0} allowDataOverflow orientation="right" width={isMobile ? 0 : 48} {...costAxisStyle} tick={<TrendAxisTick axis={costAxis} orientation="right" />} />}
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
            const isDimmed = Boolean(hoveredSeries && !isTrendSeriesHighlighted(hoveredSeries, series.key));
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
                dot={showExtrema ? undefined : {
                  r: 3,
                  fill: '#fffdf8',
                  stroke: series.color,
                  strokeWidth: 2,
                  onMouseEnter: () => activateTrendSeries(series.key),
                }}
                activeDot={{ r: 5, fill: series.color, onMouseEnter: () => activateTrendSeries(series.key) }}
                onMouseEnter={() => activateTrendSeries(series.key)}
              />
            );
          })}
          {showExtrema && hoveredExtremum && <ExtremumGuide extremum={hoveredExtremum} data={data} />}
          {extremumMarkers.map(({ series, extrema }) => (
            <TrendExtremumMarkers
              key={series.key}
              series={series}
              extrema={extrema}
              isActive={hoveredExtremum?.seriesKey === series.key}
              isDimmed={Boolean(hoveredSeries && !isTrendSeriesHighlighted(hoveredSeries, series.key))}
              onActivate={activateExtremum}
              onDeactivate={clearTrendHover}
            />
          ))}
          </AreaChart>
        </ResponsiveContainer>
        {!isMobile && axisHitZones.map((zone) => (
          <div
            key={zone.id}
            className={`trend-axis-hit-zone trend-axis-${zone.kind}-hit-zone`}
            style={zone.style}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => {
              if (zone.kind === 'line') {
                clearTrendHover();
              } else if (zone.kind === 'point') {
                const extrema = getTrendExtrema(data, zone.seriesKey);
                activateExtremum(extrema[zone.extremum === 'both' ? 'maximum' : zone.extremum]);
              } else {
                activateTrendSeries(zone.seriesKeys);
              }
            }}
            onPointerLeave={clearTrendHover}
          />
        ))}
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
      <div className="chart-legend" onMouseLeave={clearTrendHover}>
        {TREND_SERIES.map((series) => (
          <button
            className={`chart-legend-button ${visibleSeries[series.key] ? '' : 'is-hidden'} ${hoveredSeries && isTrendSeriesHighlighted(hoveredSeries, series.key) ? 'is-highlighted' : ''} ${hoveredSeries && !isTrendSeriesHighlighted(hoveredSeries, series.key) ? 'is-dimmed' : ''}`}
            key={series.key}
            type="button"
            aria-pressed={visibleSeries[series.key]}
            onClick={() => onToggleSeries(series.key)}
            onMouseEnter={() => visibleSeries[series.key] && activateTrendSeries(series.key)}
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

function TrendMobileSummary({ data }) {
  const periodTotal = data.reduce((sum, day) => sum + day.totalTokens, 0);
  const peak = data.reduce((current, day) => !current || day.totalTokens > current.totalTokens ? day : current, null);
  const latest = data.at(-1);
  const previous = data.at(-2);
  const change = previous?.totalTokens
    ? (latest.totalTokens - previous.totalTokens) / previous.totalTokens
    : null;

  return (
    <dl className="trend-mobile-summary">
      <div>
        <dt>区间 Total</dt>
        <dd>{compactTokenFmt.format(periodTotal)}</dd>
      </div>
      <div>
        <dt>峰值</dt>
        <dd>{peak ? `${formatShortDate(peak.date)} · ${compactTokenFmt.format(peak.totalTokens)}` : '—'}</dd>
      </div>
      <div>
        <dt>较前一日</dt>
        <dd className={change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''}>
          {change === null ? '—' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`}
        </dd>
      </div>
    </dl>
  );
}

function TrendAxisTick({ x, y, payload, axis, orientation, compact = false }) {
  const value = Number(payload?.value || 0);
  const { minimum, maximum } = axis.extrema;
  const isMinimum = areTrendValuesEqual(minimum?.value, value);
  const isMaximum = areTrendValuesEqual(maximum?.value, value);
  const extremum = isMinimum || isMaximum;
  const direction = orientation === 'right' ? 1 : -1;
  const labelX = x + (direction * 8);

  return (
    <g
      className={extremum ? 'trend-axis-extremum-tick' : 'trend-axis-regular-tick'}
      data-trend-axis={axis.seriesKey}
      data-extremum={extremum ? (isMinimum && isMaximum ? 'both' : isMaximum ? 'maximum' : 'minimum') : undefined}
      data-series-key={extremum ? axis.seriesKey : undefined}
    >
      <text
        x={labelX}
        y={y}
        dy={extremum ? 4 + axis.getExtremumTickOffset(value) : '0.32em'}
        textAnchor={orientation === 'right' ? 'start' : 'end'}
        fill={axis.color}
        fillOpacity={axis.opacity}
        fontSize={compact ? 11 : 12}
        fontWeight={extremum ? 700 : 400}
      >
        {extremum ? axis.extremumFormatter(value) : axis.formatter(value)}
      </text>
    </g>
  );
}

function getDefaultTrendSeriesVisibility() {
  const isMobileViewport = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 720px)').matches;
  return Object.fromEntries(TREND_SERIES.map(({ key }) => [
    key,
    !isMobileViewport || key === 'totalTokens' || key === 'outputTokens',
  ]));
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);
    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, [query]);

  return matches;
}

function formatShortDate(value) {
  return typeof value === 'string' && value.length >= 10 ? value.slice(5) : value;
}

function ExtremumGuide({ extremum, data }) {
  const series = TREND_SERIES.find(({ key }) => key === extremum.seriesKey);
  if (!series || !data.length) return null;
  const axisStartsOnLeft = series.yAxisId === TREND_AXIS_IDS.tokens;
  const boundaryDate = axisStartsOnLeft ? data[0].date : data.at(-1).date;
  if (boundaryDate === extremum.date) return null;

  return (
    <ReferenceLine
      yAxisId={series.yAxisId}
      segment={[
        { x: boundaryDate, y: extremum.value },
        { x: extremum.date, y: extremum.value },
      ]}
      stroke={series.color}
      strokeOpacity={0.72}
      strokeDasharray="4 4"
    />
  );
}

function TrendExtremumMarkers({ series, extrema, isActive, isDimmed, onActivate, onDeactivate }) {
  const { minimum, maximum } = extrema;
  if (!minimum || !maximum) return null;
  const combined = minimum.date === maximum.date && minimum.value === maximum.value;
  const color = isDimmed ? '#bdb5ab' : series.color;
  const haloOpacity = isDimmed ? 0.03 : isActive ? 0.25 : 0.16;
  const strokeOpacity = isDimmed ? 0.16 : 1;
  const fill = isDimmed ? '#fffdf8' : color;
  const eventHandlers = (extremum) => ({
    onMouseEnter: () => onActivate(extremum),
    onMouseLeave: onDeactivate,
  });

  if (combined) {
    return (
      <>
        <ReferenceDot x={maximum.date} y={maximum.value} yAxisId={series.yAxisId} r={10} fill={color} fillOpacity={haloOpacity} stroke="none" pointerEvents="none" />
        <ReferenceDot x={maximum.date} y={maximum.value} yAxisId={series.yAxisId} r={6} fill="#fffdf8" stroke={color} strokeOpacity={strokeOpacity} strokeWidth={2.5} {...eventHandlers(maximum)} />
        <ReferenceDot x={maximum.date} y={maximum.value} yAxisId={series.yAxisId} r={3} fill={fill} fillOpacity={strokeOpacity} stroke="none" pointerEvents="none" />
      </>
    );
  }

  return (
    <>
      <ReferenceDot x={maximum.date} y={maximum.value} yAxisId={series.yAxisId} r={10} fill={color} fillOpacity={haloOpacity} stroke="none" pointerEvents="none" />
      <ReferenceDot x={maximum.date} y={maximum.value} yAxisId={series.yAxisId} r={6} fill={fill} fillOpacity={strokeOpacity} stroke="#fffdf8" strokeOpacity={strokeOpacity} strokeWidth={2.5} {...eventHandlers(maximum)} />
      <ReferenceDot x={minimum.date} y={minimum.value} yAxisId={series.yAxisId} r={isActive ? 7 : 6} fill="#fffdf8" stroke={color} strokeOpacity={strokeOpacity} strokeWidth={2.5} {...eventHandlers(minimum)} />
    </>
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
  const scopeLabel = formatCoverageLabel(raw?.scan?.coverage);
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

function fillDefaultDateRange(current, events, scan) {
  if (events.length && current.datePreset === 'all') {
    return scan?.coverage?.all
      ? { ...current, ...getEventDateRange(events) }
      : current;
  }
  return current;
}

function readSavedDateSelection() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(DATE_SELECTION_KEY));
    if (!saved || !Object.hasOwn(DATE_PRESET_LABELS, saved.datePreset)) return null;
    if (saved.datePreset === 'all') return { datePreset: 'all', startDate: '', endDate: '' };
    if (saved.datePreset) return { datePreset: saved.datePreset, ...getDateRangePreset(saved.datePreset) };
    if (typeof saved.startDate !== 'string' || typeof saved.endDate !== 'string') return null;
    if (![saved.startDate, saved.endDate].every((date) => !date || /^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
    return { datePreset: '', startDate: saved.startDate, endDate: saved.endDate };
  } catch {
    return null;
  }
}

function getEventDateRange(events) {
  return events.reduce((range, event) => ({
    startDate: !range.startDate || event.date < range.startDate ? event.date : range.startDate,
    endDate: !range.endDate || event.date > range.endDate ? event.date : range.endDate,
  }), { startDate: '', endDate: '' });
}

function getCoverageRequest(filters) {
  if (filters.datePreset === 'all') return { all: true };
  if (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate) return null;
  return { startDate: filters.startDate, endDate: filters.endDate };
}

function isCoverageRequestSatisfied(request, coverage) {
  if (!request || coverage?.all) return true;
  if (request.all) return false;
  return (coverage?.ranges || []).some((range) => (
    range.startDate <= request.startDate && range.endDate >= request.endDate
  ));
}

function formatCoverageLabel(coverage) {
  if (coverage?.all) return '全部历史';
  const ranges = coverage?.ranges || [];
  if (!ranges.length) return '尚未加载范围';
  if (ranges.length === 1) return `${ranges[0].startDate} 至 ${ranges[0].endDate}`;
  return `已加载 ${ranges.length} 段日期范围`;
}

function formatScanRequestLabel(request) {
  if (request?.all) return '扫描全部历史';
  const ranges = request?.ranges || [];
  if (ranges.length === 1) return `扩展至 ${ranges[0].startDate} 至 ${ranges[0].endDate}`;
  return ranges.length > 1 ? `扩展 ${ranges.length} 段日期范围` : '刷新已加载范围';
}

function getApiErrorMessage(response, action) {
  if (response.status === 404) {
    return `${action}接口不存在：本地服务端版本较旧或未重启。请停止旧看板后重新运行 npm run dev。`;
  }
  return `${action}失败（HTTP ${response.status}）`;
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
    models: [['all', '全部'], ...models.map((model) => [model, model])],
    reasoningEfforts: [['all', '全部'], ...reasoningEfforts.map((effort) => [effort, reasoningEffortLabel(effort)])],
    cwdList: [['all', '全部'], ...cwdList],
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

function isDateInSelectedRange(date, { startDate, endDate }) {
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function buildAnalytics(events, prices, projectLabels, { includeToday = false } = {}) {
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

  if (includeToday && !daily.has(today)) {
    daily.set(today, emptyTotals({ date: today }));
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

function getTrendAxisStyle(seriesKeys, hoveredSeries, color, dashed = false) {
  const isDimmed = Boolean(hoveredSeries && !seriesKeys.some((key) => isTrendSeriesHighlighted(hoveredSeries, key)));
  const opacity = isDimmed ? 0.16 : 1;
  return {
    tick: { fill: color, fillOpacity: opacity, fontSize: 12 },
    axisLine: { stroke: color, strokeOpacity: opacity, strokeDasharray: dashed ? '4 4' : undefined },
    tickLine: { stroke: color, strokeOpacity: opacity },
  };
}

function isTrendSeriesHighlighted(hoveredSeries, seriesKey) {
  return !hoveredSeries
    || (Array.isArray(hoveredSeries) ? hoveredSeries.includes(seriesKey) : hoveredSeries === seriesKey);
}

function getTrendAxisHitZones(surface) {
  const svg = surface.querySelector('svg');
  const plot = svg?.querySelector('defs > clipPath > rect');
  const surfaceBounds = surface.getBoundingClientRect();
  const svgBounds = svg?.getBoundingClientRect();
  const viewBox = svg?.viewBox?.baseVal;
  if (!svg || !plot || !svgBounds || !viewBox?.width || !viewBox.height || !surfaceBounds.width) return [];

  const plotX = Number(plot.getAttribute('x'));
  const plotY = Number(plot.getAttribute('y'));
  const plotWidth = Number(plot.getAttribute('width'));
  const plotHeight = Number(plot.getAttribute('height'));
  if (![plotX, plotY, plotWidth, plotHeight].every(Number.isFinite) || !plotWidth || !plotHeight) return [];

  const scaleX = svgBounds.width / viewBox.width;
  const scaleY = svgBounds.height / viewBox.height;
  const top = svgBounds.top - surfaceBounds.top + ((plotY - viewBox.y) * scaleY);
  const height = plotHeight * scaleY;
  const surfaceRight = Math.min(surfaceBounds.width, svgBounds.right - surfaceBounds.left);
  const axisX = (axisClassName) => {
    const line = svg.querySelector(`.${axisClassName} .recharts-cartesian-axis-line`);
    const x1 = Number(line?.getAttribute('x1'));
    if (!line || !Number.isFinite(x1)) return null;
    return svgBounds.left - surfaceBounds.left + ((x1 - viewBox.x) * scaleX);
  };
  const zones = [];
  const axisPositions = new Map();

  const addLineZone = (id, seriesKeys, center) => {
    const lineHitWidth = 8;
    const clampedLeft = Math.max(0, Math.min(surfaceRight, center - (lineHitWidth / 2)));
    const clampedRight = Math.max(clampedLeft, Math.min(surfaceRight, center + (lineHitWidth / 2)));
    if (clampedRight - clampedLeft < 1) return;
    zones.push({
      id,
      kind: 'line',
      seriesKeys,
      style: {
        left: `${clampedLeft}px`,
        top: `${Math.max(0, top)}px`,
        width: `${clampedRight - clampedLeft}px`,
        height: `${Math.min(height, surfaceBounds.height - Math.max(0, top))}px`,
      },
    });
  };

  const outputAxisX = axisX('trend-axis-output');
  const costAxisX = axisX('trend-axis-cost');
  const tokenAxisX = axisX('trend-axis-tokens');
  const axes = [
    ['tokens', TREND_AXIS_SERIES.tokens, tokenAxisX],
    ['output', TREND_AXIS_SERIES.output, outputAxisX],
    ['cost', TREND_AXIS_SERIES.cost, costAxisX],
  ];
  axes.forEach(([id, seriesKeys, position]) => {
    if (position === null) return;
    seriesKeys.forEach((seriesKey) => axisPositions.set(seriesKey, position));
    addLineZone(id, seriesKeys, position);
  });

  svg.querySelectorAll('[data-trend-axis]').forEach((tick, index) => {
    const bounds = tick.getBoundingClientRect();
    const seriesKey = tick.getAttribute('data-trend-axis');
    const extremum = tick.getAttribute('data-extremum');
    const axisPosition = axisPositions.get(seriesKey);
    if (!seriesKey || !bounds.width || !bounds.height) return;

    zones.push({
      id: `axis-label-${seriesKey}-${index}`,
      kind: 'label',
      seriesKeys: [seriesKey],
      style: {
        left: `${Math.max(0, bounds.left - surfaceBounds.left - 4)}px`,
        top: `${Math.max(0, bounds.top - surfaceBounds.top - 4)}px`,
        width: `${Math.min(surfaceBounds.width, bounds.width + 8)}px`,
        height: `${bounds.height + 8}px`,
      },
    });

    if (!extremum || axisPosition === undefined) return;
    const pointSize = 14;
    const centerY = bounds.top - surfaceBounds.top + (bounds.height / 2);
    zones.push({
      id: `axis-point-${seriesKey}-${extremum}`,
      kind: 'point',
      seriesKey,
      extremum,
      style: {
        left: `${Math.max(0, axisPosition - (pointSize / 2))}px`,
        top: `${Math.max(0, centerY - (pointSize / 2))}px`,
        width: `${pointSize}px`,
        height: `${pointSize}px`,
      },
    });
  });
  return zones;
}

function areTrendAxisHitZonesEqual(currentZones, nextZones) {
  return currentZones.length === nextZones.length
    && currentZones.every((zone, index) => zone.id === nextZones[index].id
      && zone.style.left === nextZones[index].style.left
      && zone.style.width === nextZones[index].style.width
      && zone.style.top === nextZones[index].style.top
      && zone.style.height === nextZones[index].style.height);
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
