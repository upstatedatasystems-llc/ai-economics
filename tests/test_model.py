import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ai_economics.app import load_catalog, build, SITE
from ai_economics.model import estimate, values


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

    def test_build(self):
        build()
        self.assertTrue((SITE / "data" / "research.json").is_file())


if __name__ == "__main__":
    unittest.main()
