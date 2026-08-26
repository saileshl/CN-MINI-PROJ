"""
Tests — RTT Measurement & RTT Variation (Jitter) Calculation
=============================================================
These test the project's primary jitter metric: RTT Variation.
    variation_i = abs(RTT_i - RTT_{i-1})
    Average RTT Variation = mean(variation_i)

This is NOT RFC 3550 RTP interarrival jitter.
"""

import sys
import os
import math

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from network_agent import calculate_metrics, _percentile


class TestRTTCalculation:
    """Test basic RTT calculation from timestamps."""

    def test_single_rtt(self):
        """Single RTT value produces correct metrics."""
        metrics = calculate_metrics([50.0])
        assert metrics["avg_rtt"] == 50.0
        assert metrics["min_rtt"] == 50.0
        assert metrics["max_rtt"] == 50.0
        assert metrics["sample_count"] == 1
        # No variation with single packet
        assert metrics["avg_rtt_variation"] == 0.0

    def test_constant_rtt(self):
        """Constant RTT values → zero variation."""
        rtt_values = [50.0] * 20
        metrics = calculate_metrics(rtt_values)
        assert metrics["avg_rtt"] == 50.0
        assert metrics["avg_rtt_variation"] == 0.0
        assert metrics["stdev_rtt"] == 0.0

    def test_varying_rtt(self):
        """Varying RTT values → non-zero variation."""
        rtt_values = [50.0, 60.0, 45.0, 70.0, 55.0]
        metrics = calculate_metrics(rtt_values)

        assert metrics["avg_rtt"] == 56.0
        assert metrics["min_rtt"] == 45.0
        assert metrics["max_rtt"] == 70.0

        # variations: |60-50|=10, |45-60|=15, |70-45|=25, |55-70|=15
        expected_variation = (10 + 15 + 25 + 15) / 4  # = 16.25
        assert abs(metrics["avg_rtt_variation"] - expected_variation) < 0.01

    def test_two_packets(self):
        """Two packets → single variation value."""
        metrics = calculate_metrics([100.0, 120.0])
        assert metrics["avg_rtt_variation"] == 20.0
        assert metrics["sample_count"] == 2

    def test_empty_input(self):
        """Empty input returns empty dict."""
        metrics = calculate_metrics([])
        assert metrics == {}

    def test_stdev_calculation(self):
        """Standard deviation is calculated correctly."""
        rtt_values = [10.0, 20.0, 30.0, 40.0, 50.0]
        metrics = calculate_metrics(rtt_values)
        # stdev of [10,20,30,40,50] (sample) ≈ 15.8114
        assert abs(metrics["stdev_rtt"] - 15.8114) < 0.01

    def test_percentiles(self):
        """Percentile calculations are correct."""
        rtt_values = list(range(1, 101))  # 1 to 100
        metrics = calculate_metrics([float(x) for x in rtt_values])

        assert abs(metrics["p50_rtt"] - 50.5) < 1.0
        assert abs(metrics["p95_rtt"] - 95.05) < 1.0
        assert abs(metrics["p99_rtt"] - 99.01) < 1.0

    def test_high_jitter_scenario(self):
        """High jitter scenario: alternating low and high RTT."""
        rtt_values = [10.0, 100.0, 10.0, 100.0, 10.0, 100.0]
        metrics = calculate_metrics(rtt_values)

        assert metrics["avg_rtt"] == 55.0
        assert metrics["min_rtt"] == 10.0
        assert metrics["max_rtt"] == 100.0
        # All variations = 90
        assert metrics["avg_rtt_variation"] == 90.0

    def test_zero_rtt(self):
        """Zero RTT values are handled (localhost scenario)."""
        rtt_values = [0.0, 0.0, 0.0]
        metrics = calculate_metrics(rtt_values)
        assert metrics["avg_rtt"] == 0.0
        assert metrics["avg_rtt_variation"] == 0.0


class TestPercentile:
    """Test the percentile helper function."""

    def test_empty(self):
        assert _percentile([], 50) == 0

    def test_single(self):
        assert _percentile([42.0], 50) == 42.0

    def test_median(self):
        assert _percentile([1.0, 2.0, 3.0, 4.0, 5.0], 50) == 3.0

    def test_extremes(self):
        data = sorted([10.0, 20.0, 30.0, 40.0, 50.0])
        assert _percentile(data, 0) == 10.0
        assert _percentile(data, 100) == 50.0


class TestPacketLoss:
    """Test packet loss calculation."""

    def test_no_loss(self):
        """All packets received → 0% loss."""
        rtt_values = [50.0] * 100
        metrics = calculate_metrics(rtt_values)
        assert metrics["sample_count"] == 100

    def test_partial_data(self):
        """Fewer RTT values than expected still produces valid metrics."""
        rtt_values = [50.0, 60.0, 70.0]
        metrics = calculate_metrics(rtt_values)
        assert metrics["sample_count"] == 3
        assert metrics["avg_rtt"] == 60.0


# ----------------------------------------------------------
# Run with pytest
# ----------------------------------------------------------
if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
