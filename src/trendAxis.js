const TREND_MAGNITUDE_UNITS = [
  { divisor: 1_000_000_000, suffix: 'B' },
  { divisor: 1_000_000, suffix: 'M' },
  { divisor: 1_000, suffix: 'K' },
  { divisor: 1, suffix: '' },
];
const TREND_TICK_COUNT = 4;
const NICE_STEP_MULTIPLIERS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export function getTrendAxisConfig(data, seriesKey, maximum, isCurrency, color, opacity) {
  const values = data.map((row) => Math.max(0, Number(row[seriesKey] || 0)));
  const safeMaximum = Math.max(maximum, 1);
  const unit = getTrendMagnitudeUnit(safeMaximum);
  const regularTicks = getTrendAxisRegularTicks(safeMaximum);
  const baseFractionDigits = getTrendAxisFractionDigits(regularTicks[1] || safeMaximum, unit.divisor);
  const extrema = getTrendExtrema(data, seriesKey);
  return {
    seriesKey,
    domain: [0, safeMaximum],
    color,
    opacity,
    extrema,
    regularTicks,
    // Extrema remain axis ticks so their existing axis hit targets still work.
    ticks: getTrendAxisTicks(safeMaximum, values),
    formatter: (value) => formatTrendAxisValue(value, unit, isCurrency, baseFractionDigits),
    // The narrow Total axis needs a compact value so its leading digits are never clipped.
    extremumFormatter: (value) => seriesKey === 'totalTokens'
      ? formatCompactTotalExtremum(value, unit)
      : formatTrendAxisValue(value, unit, isCurrency, Math.max(baseFractionDigits + 1, 3)),
    getExtremumTickOffset: (value) => getTrendExtremumTickOffset(value, regularTicks),
  };
}

export function getTrendReferenceMaximum(data) {
  const totalMaximum = getTrendSeriesMaximum(data, 'totalTokens');
  const outputAsTotal = getTrendSeriesMaximum(data, 'outputTokens') * 100;
  const costAsTotal = getTrendSeriesMaximum(data, 'costUsd') * 1_000_000;
  return getNiceAxisMaximum(Math.max(totalMaximum, outputAsTotal, costAsTotal));
}

export function getTrendExtrema(data, seriesKey) {
  return data.reduce((extrema, row) => {
    const value = Math.max(0, Number(row[seriesKey] || 0));
    const point = { date: row.date, value, seriesKey };
    return {
      minimum: !extrema.minimum || value < extrema.minimum.value ? point : extrema.minimum,
      maximum: !extrema.maximum || value > extrema.maximum.value ? point : extrema.maximum,
    };
  }, { minimum: null, maximum: null });
}

export function getNiceAxisMaximum(value) {
  if (!value) return 1;
  const roughStep = value / TREND_TICK_COUNT;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const multiplier = NICE_STEP_MULTIPLIERS.find((candidate) => normalizedStep <= candidate) || 10;
  return roundTrendNumber(multiplier * magnitude * TREND_TICK_COUNT);
}

export function areTrendValuesEqual(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * 1e-10;
}

function getTrendSeriesMaximum(data, seriesKey) {
  return Math.max(0, ...data.map((row) => Math.max(0, Number(row[seriesKey] || 0))));
}

function getTrendMagnitudeUnit(maximum) {
  return TREND_MAGNITUDE_UNITS.find(({ divisor }) => maximum >= divisor) || TREND_MAGNITUDE_UNITS.at(-1);
}

function getTrendAxisRegularTicks(maximum) {
  const step = maximum / TREND_TICK_COUNT;
  return Array.from({ length: TREND_TICK_COUNT + 1 }, (_, index) => roundTrendNumber(step * index));
}

function getTrendAxisTicks(maximum, values) {
  const regularTicks = getTrendAxisRegularTicks(maximum);
  const actualMinimum = Math.min(...values);
  const actualMaximum = Math.max(...values);
  return [...new Set([...regularTicks, actualMinimum, actualMaximum])]
    .filter((value) => value >= 0 && value <= maximum)
    .sort((left, right) => left - right);
}

function getTrendExtremumTickOffset(value, regularTicks) {
  const closestTick = regularTicks.reduce((closest, tick) => (
    Math.abs(tick - value) < Math.abs(closest - value) ? tick : closest
  ));
  const step = regularTicks[1] - regularTicks[0];
  if (!step || areTrendValuesEqual(value, closestTick) || Math.abs(closestTick - value) > step * 0.35) return 0;
  // Larger values are higher in the SVG coordinate system, so invert the visual direction.
  return closestTick > value ? 12 : -12;
}

function getTrendAxisFractionDigits(step, divisor) {
  const normalized = Math.abs(step / divisor);
  for (let digits = 0; digits <= 3; digits += 1) {
    if (Number.isInteger(normalized * (10 ** digits))) return digits;
  }
  return 3;
}

function formatTrendAxisValue(value, unit, isCurrency, maximumFractionDigits = 4) {
  const absoluteValue = Math.abs(Number(value || 0));
  const scaled = absoluteValue / unit.divisor;
  if (scaled === 0) return isCurrency ? '$0' : '0';

  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(Number(value || 0) / unit.divisor);
  return `${isCurrency ? '$' : ''}${formatted}${unit.suffix}`;
}

function formatCompactTotalExtremum(value, unit) {
  const scaled = Number(value || 0) / unit.divisor;
  const absoluteValue = Math.abs(scaled);
  if (absoluteValue === 0) return '0';
  const fractionDigits = absoluteValue >= 100 ? 0 : absoluteValue >= 10 ? 1 : 3;
  const factor = 10 ** fractionDigits;
  const truncated = Math.trunc(scaled * factor) / factor;
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: fractionDigits }).format(truncated);
  return `${formatted}${unit.suffix}`;
}

function roundTrendNumber(value) {
  return Number(value.toPrecision(12));
}
