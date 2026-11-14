"""Regression tests from purgatory01's 2026-11-14 collector diagnostics."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError

from ai_economics import monitor
from ai_economics.app import load_catalog


BASE = b"""<html><head><script>var nonce='random-one';</script></head><body>
<nav>Today 14 Nov</nav><h1>Model pricing</h1>
<p>Standard model input tokens $3.00 per million</p>
<p>Output tokens $15.00 per million</p>
<footer>Created 10:15 AM</footer></body></html>"""


class SourceMonitorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "monitor.sqlite"
        self.config = {"sources": [
            {"id": "blocked_manually", "monitor_mode": "manual",
             "url": "https://example.test/manual", "frequency_days": 30},
            {"id": "pricing", "monitor_mode": "price_watch",
             "url": "https://example.test/price", "frequency_days": 1},
        ]}
        self.t = datetime(2026,11,14,12,0,tzinfo=timezone.utc)

    def at(self, days=0):
        return (self.t+timedelta(days=days)).isoformat()

    def test_manual_source_never_fetches(self):
        calls = []
        def fetch(url):
            calls.append(url)
            return BASE, "text/html"
        result = monitor.collect(self.config, self.db, fetcher=fetch, clock=lambda:self.at())
        self.assertEqual(calls, ["https://example.test/price"])
        self.assertEqual(result["sources"][0]["status"], "manual_review")
        self.assertEqual(result["sources"][1]["status"], "baseline_observed")

    def test_html_nonce_does_not_trigger_change(self):
        monitor.collect(self.config,self.db,fetcher=lambda url:(BASE,"text/html"),
                        clock=lambda:self.at())
        shuffled = BASE.replace(b"random-one",b"random-two").replace(
            b"Created 10:15 AM",b"Created 10:45 AM")
        result = monitor.collect(self.config,self.db,force=True,
                                 fetcher=lambda url:(shuffled,"text/html"),
                                 clock=lambda:self.at())
        self.assertEqual(result["sources"][1]["status"],"unchanged")

    def test_real_price_difference_creates_candidate_not_catalog_update(self):
        monitor.collect(self.config,self.db,fetcher=lambda url:(BASE,"text/html"),
                        clock=lambda:self.at())
        changed = BASE.replace(b"$3.00", b"$4.25")
        result = monitor.collect(self.config,self.db,force=True,
                                 fetcher=lambda url:(changed,"text/html"),
                                 clock=lambda:self.at())
        self.assertEqual(result["sources"][1]["status"],"candidate_change")
        self.assertEqual(monitor.health(self.config,self.db)["summary"]["candidate_change"],1)
        monitor.acknowledge(self.config,self.db,"pricing")
        result = monitor.collect(self.config,self.db,force=True,
                                 fetcher=lambda url:(changed,"text/html"),
                                 clock=lambda:self.at())
        self.assertEqual(result["sources"][1]["status"],"unchanged")

    def test_not_due_skips_network(self):
        monitor.collect(self.config,self.db,fetcher=lambda url:(BASE,"text/html"),
                        clock=lambda:self.at())
        result=monitor.collect(self.config,self.db,fetcher=lambda url:(_ for _ in ()).throw(
            AssertionError("unexpected HTTP request")),clock=lambda:self.at())
        self.assertEqual(result["sources"][1]["status"],"not_due")

    def test_403_blocked_with_no_numeric_catalog_mutation(self):
        def denied(url):
            raise HTTPError(url,403,"Forbidden",None,None)
        result = monitor.collect(self.config,self.db,force=True,fetcher=denied,
                                 clock=lambda:self.at())
        self.assertEqual(result["sources"][1]["status"],"blocked")
        self.assertEqual(monitor.health(self.config,self.db)["summary"]["blocked"],1)

    def test_missing_price_evidence_is_not_a_change(self):
        html=b"<html><body><p>Welcome to our blog</p><script>nonce=124</script></body></html>"
        result=monitor.collect(self.config,self.db,fetcher=lambda url:(html,"text/html"),
                               clock=lambda:self.at())
        self.assertEqual(result["sources"][1]["status"],"unverifiable")
        self.assertEqual(result["sources"][1]["evidence_count"],0)

    def test_google_unverifiable_pages_are_explicitly_manual(self):
        sources = {s["id"]: s for s in load_catalog()["sources"]}
        self.assertEqual(sources["google_plan"]["monitor_mode"], "manual")
        self.assertEqual(sources["google_api"]["monitor_mode"], "manual")

    def test_content_type_gate(self):
        self.assertEqual(monitor.meaningful_evidence(b"%PDF $4.20 per token","application/pdf"),[])


if __name__ == "__main__":
    unittest.main()
