import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTrendAxisConfig, getTrendReferenceMaximum } from '../src/trendAxis.js';

const rows = [
  { date: '2026-08-14', totalTokens: 31_250_000, outputTokens: 180_000, costUsd: 16.8 },
  { date: '2026-08-15', totalTokens: 81_600_000, outputTokens: 360_000, costUsd: 28.6 },
  { date: '2026-08-16', totalTokens: 11_900_000, outputTokens: 59_900, costUsd: 0.895 },
  { date: '2026-08-18', totalTokens: 113_000_000, outputTokens: 568_000, costUsd: 62.63 },
];

test('uses whole-number Total divisions and correctly formatted extrema', () => {
  const maximum = getTrendReferenceMaximum(rows);
  const axis = getTrendAxisConfig(rows, 'totalTokens', maximum, false, '#9f4d36', 1);

  assert.equal(maximum, 120_000_000);
  assert.deepEqual(axis.regularTicks, [0, 30_000_000, 60_000_000, 90_000_000, 120_000_000]);
  assert.equal(axis.formatter(30_000_000), '30M');
  assert.equal(axis.extremumFormatter(113_000_000), '113M');
  assert.equal(axis.extremumFormatter(11_900_000), '11.9M');
  assert.equal(axis.getExtremumTickOffset(113_000_000), 12);
  assert.equal(axis.getExtremumTickOffset(11_900_000), 0);
});

test('compacts a high-precision Total extremum without clipping its leading digits', () => {
  const axis = getTrendAxisConfig([
    { date: '2026-08-16', totalTokens: 11_922_107 },
    { date: '2026-08-18', totalTokens: 113_717_401 },
  ], 'totalTokens', 120_000_000, false, '#9f4d36', 1);

  assert.equal(axis.extremumFormatter(113_717_401), '113M');
  assert.equal(axis.extremumFormatter(11_922_107), '11.9M');
});

test('keeps Output and Cost extrema in their own linked-axis units and offsets collisions', () => {
  const maximum = getTrendReferenceMaximum(rows);
  const outputAxis = getTrendAxisConfig(rows, 'outputTokens', maximum / 100, false, '#3f6574', 1);
  const costAxis = getTrendAxisConfig(rows, 'costUsd', maximum / 1_000_000, true, '#b98b45', 1);

  assert.deepEqual(outputAxis.regularTicks, [0, 300_000, 600_000, 900_000, 1_200_000]);
  assert.equal(outputAxis.extremumFormatter(568_000), '0.568M');
  assert.equal(outputAxis.getExtremumTickOffset(568_000), 12);
  assert.equal(costAxis.extremumFormatter(62.63), '$62.63');
  assert.equal(costAxis.extremumFormatter(0.895), '$0.895');
  assert.equal(costAxis.getExtremumTickOffset(62.63), -12);
  assert.equal(costAxis.getExtremumTickOffset(0.895), -12);
});
