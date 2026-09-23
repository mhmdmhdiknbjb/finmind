/**
 * Pure-JS evaluator for a LightGBM model exported via `Booster.dump_model()` (see
 * tools/export_market_pack.py -> marketdata/stack_models/*.json) — no LightGBM, Python, or native
 * binding needed at runtime. This mirrors LightGBM's own tree-walk exactly: at each split node, go
 * left if `features[split_feature] <= threshold`, otherwise right; a missing/non-finite feature value
 * follows `default_left`. The model's `leaf_value` already has the per-tree shrinkage (learning rate)
 * baked in, so the prediction is simply the sum of the leaf reached in every tree — no extra scaling.
 *
 * This only needs to reproduce plain numeric-regression LightGBM models (objective "quantile" here,
 * num_class=1, no categorical splits) — not the general LightGBM feature set.
 */

function walk(node, x) {
  if (node.leaf_value !== undefined) return node.leaf_value;
  const v = x[node.split_feature];
  const goLeft = Number.isFinite(v) ? v <= node.threshold : node.default_left;
  return walk(goLeft ? node.left_child : node.right_child, x);
}

/**
 * dumpedModel: the JSON object from Booster.dump_model() (one quantile's model).
 * featureMap: { featureName: number|null }. Any feature the model expects but featureMap doesn't
 * have is treated as missing (NaN) and routed by each split's default_left, same as LightGBM does
 * for genuinely-missing training data — never throws for an absent key.
 */
export function predictLightGBM(dumpedModel, featureMap) {
  const x = dumpedModel.feature_names.map((name) => {
    const v = featureMap[name];
    return typeof v === "number" && Number.isFinite(v) ? v : NaN;
  });
  let sum = 0;
  for (const tree of dumpedModel.tree_info) sum += walk(tree.tree_structure, x);
  return sum;
}
