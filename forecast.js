/**
 * Phase 3 — Trend forecasting.
 *
 * Holt's linear (double exponential smoothing) trend method: a real, small,
 * classical forecasting model — not an LLM guess and not a heavyweight
 * neural net. It is a deliberately modest starting point (the roadmap calls
 * for "ARIMA or simple regression before LSTM").
 *
 *   level_t = alpha*y_t + (1-alpha)*(level_{t-1} + trend_{t-1})
 *   trend_t = beta*(level_t - level_{t-1}) + (1-beta)*trend_{t-1}
 *   forecast(h) = level_T + h * trend_T
 *
 * alpha/beta are fit by grid search minimizing in-sample one-step-ahead
 * squared error (a standard, legitimate way to fit smoothing parameters
 * without pulling in an optimization dependency for a 2-parameter search).
 * The forecast's confidence band widens with the horizon based on the
 * in-sample residual standard deviation — again real statistics, not an
 * invented range.
 */

function fitHoltOnce(values, alpha, beta) {
  let level = values[0];
  let trend = values[1] - values[0];
  const fitted = [level + trend];
  let sse = 0;

  for (let t = 1; t < values.length; t++) {
    const forecastPrev = level + trend;
    const err = values[t] - forecastPrev;
    sse += err * err;

    const newLevel = alpha * values[t] + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
    trend = newTrend;
    fitted.push(level + trend);
  }

  return { level, trend, sse, fitted };
}

function fitHolt(values) {
  let best = null;
  for (let alpha = 0.05; alpha <= 0.95; alpha += 0.05) {
    for (let beta = 0.05; beta <= 0.95; beta += 0.05) {
      const r = fitHoltOnce(values, alpha, beta);
      if (!best || r.sse < best.sse) best = { ...r, alpha, beta };
    }
  }
  return best;
}

/**
 * series: [{period: string|number, value: number}], ordered oldest -> newest.
 * horizon: number of future periods to forecast.
 */
export function forecastSeries(series, horizon = 6) {
  const values = series.map((p) => p.value);
  if (values.length < 4) {
    return { error: "حداقل ۴ نقطه‌ی تاریخی برای پیش‌بینی لازم است.", points: [] };
  }

  const fit = fitHolt(values);
  const residuals = values.slice(1).map((v, i) => v - fit.fitted[i]);
  const residualStd = Math.sqrt(residuals.reduce((s, e) => s + e * e, 0) / Math.max(1, residuals.length - 1));

  const points = [];
  for (let h = 1; h <= horizon; h++) {
    const point = fit.level + h * fit.trend;
    const band = residualStd * Math.sqrt(h) * 1.04; // ~70% CI under a normal-error assumption
    points.push({
      h,
      p15: point - band,
      p50: point,
      p85: point + band,
    });
  }

  const lastValue = values[values.length - 1];
  const totalChangePercent = ((points[points.length - 1].p50 - lastValue) / lastValue) * 100;

  return {
    alpha: fit.alpha,
    beta: fit.beta,
    trendPerPeriod: fit.trend,
    lastValue,
    residualStd,
    points,
    totalChangePercent: Math.round(totalChangePercent * 10) / 10,
  };
}
