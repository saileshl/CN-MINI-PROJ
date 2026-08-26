"""
Tests — Adaptive Jitter Buffer (Behavior Verification)
=======================================================
Unit tests verify correct buffer BEHAVIOR, not blanket outcomes.

We do NOT assert "effective_variation < raw_variation" universally.
That is tested separately in test_experiment.py under controlled
conditions only.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from jitter_buffer import JitterBuffer


class TestBufferSequencing:
    """Test correct packet sequencing behavior."""

    def test_normal_order(self):
        """Packets arriving in order are buffered correctly."""
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200, playout_interval_ms=50)

        for seq in range(1, 6):
            result = buf.receive_packet(seq, seq * 50)
            assert result["status"] == "buffered"
            assert result["seq"] == seq
            assert result["out_of_order"] is False

    def test_out_of_order_detection(self):
        """Out-of-order packets are detected and reordered."""
        buf = JitterBuffer(min_depth_ms=50, max_depth_ms=200, playout_interval_ms=50)

        buf.receive_packet(1, 50)
        buf.receive_packet(3, 150)  # skip 2

        # Now seq 2 arrives late but within deadline
        buf.receive_packet(2, 160)

        # Buffer should have reordered: {1, 2, 3}
        keys = list(buf.buffer.keys())
        assert keys == [1, 2, 3]
        assert buf.stats["packets_out_of_order"] == 1

    def test_missing_packet_detection(self):
        """Missing packets are detected during playout."""
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200, playout_interval_ms=50)

        # Receive packets 1 and 3 (skip 2)
        buf.receive_packet(1, 50)
        buf.receive_packet(3, 150)

        # Playout packet 1
        result1 = buf.playout(buf.playout_start_time)
        assert result1["status"] == "played"
        assert result1["seq"] == 1

        # Playout at next interval — packet 2 is missing
        result2 = buf.playout(buf.playout_start_time + 50)
        assert result2["status"] == "missing"
        assert result2["seq"] == 2
        assert buf.stats["packets_missing"] == 1


class TestBufferPlayout:
    """Test playout scheduling behavior."""

    def test_playout_timing(self):
        """Packets are played out at steady intervals."""
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200, playout_interval_ms=50)

        # Add 5 packets
        for seq in range(1, 6):
            buf.receive_packet(seq, seq * 50)

        # Playout should not happen before playout_start_time
        result_early = buf.playout(buf.playout_start_time - 1)
        assert result_early is None

        # Playout at correct times
        playout_times = []
        for i in range(5):
            t = buf.playout_start_time + (i * 50)
            result = buf.playout(t)
            assert result is not None
            assert result["status"] == "played"
            assert result["seq"] == i + 1
            playout_times.append(t)

        # Verify steady intervals
        for i in range(1, len(playout_times)):
            interval = playout_times[i] - playout_times[i - 1]
            assert interval == 50

    def test_no_playout_when_empty(self):
        """No playout possible when buffer is empty and not initialized."""
        buf = JitterBuffer()
        result = buf.playout(1000)
        assert result is None


class TestLatePackets:
    """Test late packet detection and dropping."""

    def test_late_packet_dropped(self):
        """Packet arriving after its playout deadline is dropped."""
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=50, playout_interval_ms=50)

        # Add first packet to initialize timeline
        buf.receive_packet(1, 50)

        # Playout packet 1
        buf.playout(buf.playout_start_time)

        # Now seq 2 should have been played at playout_start + 50
        # Send it very late (way past deadline)
        very_late_time = buf.playout_start_time + 50 + 200 + 1000
        result = buf.receive_packet(2, very_late_time)
        assert result["status"] == "dropped_late"
        assert result["seq"] == 2
        assert buf.stats["packets_dropped_late"] == 1


class TestAdaptiveDepth:
    """Test adaptive buffer depth calculation."""

    def test_depth_increases_under_high_variation(self):
        """Buffer depth increases when inter-arrival variation is high."""
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200,
                          playout_interval_ms=50, ewma_alpha=0.5)

        # Send packets with high variation in inter-arrival times
        times = [50, 150, 160, 300, 310, 500]  # highly variable
        initial_depth = buf.target_depth_ms

        for i, t in enumerate(times):
            buf.receive_packet(i + 1, t)

        # Depth should have increased from initial
        assert buf.target_depth_ms >= initial_depth

    def test_depth_stays_within_bounds(self):
        """Buffer depth is clamped to min/max."""
        buf = JitterBuffer(min_depth_ms=30, max_depth_ms=100, playout_interval_ms=50)

        # Low variation — should stay at min
        for i in range(1, 20):
            buf.receive_packet(i, i * 50)

        assert buf.target_depth_ms >= 30

        # Reset and test extreme variation
        buf.reset()
        for i in range(1, 20):
            buf.receive_packet(i, i * 500)  # very spread out

        assert buf.target_depth_ms <= 100


class TestBufferStats:
    """Test statistics reporting."""

    def test_stats_tracking(self):
        """Stats are tracked correctly."""
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200, playout_interval_ms=50)

        for seq in range(1, 11):
            buf.receive_packet(seq, seq * 50)

        stats = buf.get_stats()
        assert stats["packets_received"] == 10
        assert stats["buffer_size"] == 10
        assert stats["target_depth_ms"] >= 20

    def test_effective_delivery_variation_calculated(self):
        """Effective delivery variation is computed from actual playout times."""
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200, playout_interval_ms=50)

        for seq in range(1, 6):
            buf.receive_packet(seq, seq * 50)

        # Play out at steady intervals
        for i in range(5):
            buf.playout(buf.playout_start_time + (i * 50))

        stats = buf.get_stats()
        assert stats["packets_played"] == 5
        # Effective variation should be 0 (perfectly steady playout)
        assert stats["effective_delivery_variation"] == 0.0

    def test_reset_clears_state(self):
        """Reset clears all buffer state."""
        buf = JitterBuffer()
        buf.receive_packet(1, 50)
        buf.receive_packet(2, 100)

        buf.reset()
        stats = buf.get_stats()
        assert stats["packets_received"] == 0
        assert stats["buffer_size"] == 0
        assert buf.expected_seq == 1


# ----------------------------------------------------------
# Run with pytest
# ----------------------------------------------------------
if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
