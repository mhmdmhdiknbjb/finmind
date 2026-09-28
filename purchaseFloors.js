/**
 * Minimum realistic prices for the two big-ticket purchases people ask about. Like every number in this app they come
 * from the server, never from the model: they go into every prompt as data, and grounding.js uses them to block advice
 * («خانه بخر») a user's assets cannot pay for and to mark such a decision infeasible.
 *
 * They are deliberately rough «cheapest realistic» figures (a small apartment in a smaller city / a basic new domestic
 * car), not market quotes — override with FINMIND_MIN_HOME_PRICE / FINMIND_MIN_CAR_PRICE (toman) in .env as prices move.
 */
const fromEnv = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const MIN_HOME_PRICE = fromEnv("FINMIND_MIN_HOME_PRICE", 4_000_000_000);
export const MIN_CAR_PRICE = fromEnv("FINMIND_MIN_CAR_PRICE", 800_000_000);
