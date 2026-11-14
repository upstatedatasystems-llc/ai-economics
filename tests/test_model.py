import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ai_economics.app import load_catalog, load_workloads, load_macro, build, SITE
from ai_economics.model import estimate, values, estimate_workload, estimate_macro


class ModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = load_catalog()

    def test_providers(self):
        self.assertEqual({p["id"] for p in self.catalog["providers"]},
                         {"openai","anthropic","google"})

    def test_pricing_cache(self):
        result = estimate(self.catalog, "openai", responses=1000, input_tokens=2000,
                          output_tokens=1000, cache_fraction=0.5)
        self.assertAlmostEqual(result["api_retail_equivalent_usd"], 12.1)

    def test_cost_layers(self):
        result = estimate(self.catalog, "google")
        self.assertAlmostEqual(result["direct_infrastructure_usd"] +
                               result["allocated_operations_and_admin_usd"],
                               result["total_modeled_serving_usd"], places=7)

    def test_zero_use(self):
        result = estimate(self.catalog, "anthropic", responses=0)
        self.assertEqual(result["total_modeled_serving_usd"], 0)

    def test_free_user_has_no_assumed_ads(self):
        result = estimate(self.catalog, "openai", subscription=False)
        self.assertEqual(result["gross_subscription_revenue_usd"], 0)

    def test_modes_differ(self):
        self.assertNotEqual(estimate(self.catalog,"google",ownership="cloud")["direct_infrastructure_usd"],
                            estimate(self.catalog,"google",ownership="owned")["direct_infrastructure_usd"])

    def test_invalid(self):
        for kw in ({"responses":-1},{"ownership":"invalid"},{"thinking_multiplier":0},
                   {"cache_fraction":2}):
            with self.subTest(kw=kw), self.assertRaises(ValueError):
                estimate(self.catalog,"google",**kw)
        with self.assertRaises(ValueError):
            values(self.catalog, {"utilization":2})

    def test_examples_show_real_units(self):
        samples = {w["id"]: w for w in load_workloads()["examples"]}
        self.assertGreater(samples["coding"]["model_calls"], samples["brainstorm"]["model_calls"])
        self.assertGreater(samples["brainstorm"]["model_calls"], samples["quick"]["model_calls"])
        cheap = estimate_workload(self.catalog, "openai", samples["quick"])
        complex_task = estimate_workload(self.catalog, "openai", samples["coding"])
        self.assertGreater(complex_task["per_task"]["api_retail_equivalent_usd"],
                           cheap["per_task"]["api_retail_equivalent_usd"])
        self.assertEqual(complex_task["volume"]["tool_executions_unpriced"], 85)
        self.assertIsNone(complex_task["per_task"]["total_if_external_cost_specified_usd"])
        self.assertGreater(complex_task["volume"]["extra_hidden_output_tokens_estimated"], 0)

    def test_explicit_external_cost_is_not_invented(self):
        sample = load_workloads()["examples"][2]
        result = estimate_workload(self.catalog, "anthropic", sample,
                                   external_tool_usd_per_task=2.5)
        self.assertAlmostEqual(
            result["per_task"]["total_if_external_cost_specified_usd"],
            result["per_task"]["modeled_inference_subtotal_usd"] + 2.5, places=6)

    def test_macro_scaling_preserves_units(self):
        workloads = load_workloads()["examples"]
        options = load_macro()["profiles"]["openai"]
        macro = estimate_macro(self.catalog, "openai", workloads, options)
        self.assertFalse(macro["is_actual_provider_data"])
        self.assertGreater(macro["month"]["modeled_serving_usd"], 0)
        self.assertAlmostEqual(macro["year"]["gross_revenue_usd"],
                               12 * macro["month"]["gross_revenue_usd"], delta=1)
        self.assertAlmostEqual(macro["day"]["modeled_serving_usd"] * 365.25,
                               macro["year"]["modeled_serving_usd"], delta=3)
        self.assertAlmostEqual(macro["month"]["modeled_serving_usd"],
                               macro["month"]["consumer_serving_usd"] +
                               macro["month"]["api_serving_usd"], delta=1)

    def test_macro_zero_activity(self):
        options = dict(load_macro()["profiles"]["google"])
        options.update(paid_users=0, free_users=0, api_tasks_per_month=0)
        result = estimate_macro(self.catalog, "google", load_workloads()["examples"], options)
        self.assertEqual(result["month"]["modeled_serving_usd"], 0)
        self.assertEqual(result["month"]["gross_revenue_usd"], 0)

    def test_build(self):
        build()
        self.assertTrue((SITE / "data" / "research.json").is_file())
        import json
        d = json.loads((SITE / "data" / "research.json").read_text())
        self.assertEqual(len(d["workloads"]["examples"]), 4)
        self.assertEqual(set(d["sample_macro_results"]), {"openai", "anthropic", "google"})


if __name__ == "__main__":
    unittest.main()
