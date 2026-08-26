"""
Deterministic Integration Test — Controlled Before/After Experiment
====================================================================
Tests the jitter buffer under a FIXED, reproducible impairment profile.

This is the ONLY place where we assert that the buffer produces a
measurable improvement — and ONLY for this specific controlled scenario.

This is NOT a universal guarantee. If the buffer fails to improve
delivery under this controlled scenario, the test FAILS and the
implementation should be investigated.

Impairment Profile:
  - 200 packets at 50ms intervals
  - Base delay: 30ms
  - Random jitter: ±40ms (uniform)
  - Packet loss: 0% (deterministic schedule, no loss for this test)
  - Seed: 12345
"""

import sys
import os
import math
import statistics

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from jitter_buffer import JitterBuffer


def create_seeded_rng(seed):
    """Mulberry32 PRNG — matches the backend's ExperimentManager."""
    s = seed & 0xFFFFFFFF

    def rng():
        nonlocal s
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        t = (s ^ (s >> 15)) * (1 | s) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) ^ t) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rng


def generate_impairment_schedule(packet_count, base_delay_ms, random_jitter_ms,
                                  packet_loss_percent, seed):
    """Generate a deterministic impairment schedule (mirrors backend)."""
    rng = create_seeded_rng(seed)
    schedule = []

    for seq in range(1, packet_count + 1):
        loss_roll = rng() * 100
        drop = loss_roll < packet_loss_percent

        jitter_offset = (rng() * 2 - 1) * random_jitter_ms
        delay_ms = max(0, round(base_delay_ms + jitter_offset))

        _ = rng()  # consume reorder roll (matching backend)

        schedule.append({
            'seq': seq,
            'delay_ms': 0 if drop else delay_ms,
            'drop': drop,
        })

    return schedule


def simulate_test(schedule, packet_interval_ms, jitter_buffer=None):
    """
    Simulate a UDP test using the impairment schedule.

    Returns:
        rtt_values: list of RTT measurements
        arrival_times: list of arrival timestamps
    """
    rtt_values = []
    arrival_times = []

    base_time = 0

    for event in schedule:
        seq = event['seq']
        send_time = base_time + (seq - 1) * packet_interval_ms

        if event['drop']:
            continue  # Packet dropped — no response

        # RTT = send-to-server + server processing + server-to-agent
        # The impairment delay is applied on the server response
        rtt = event['delay_ms'] + 1  # +1ms base network time
        recv_time = send_time + rtt
        arrival_times.append(recv_time)
        rtt_values.append(rtt)

        # Feed into jitter buffer if provided
        if jitter_buffer is not None:
            jitter_buffer.receive_packet(seq, recv_time, {'rtt': rtt})

    return rtt_values, arrival_times


def calculate_variation(values):
    """Calculate average variation (abs difference of consecutive values)."""
    if len(values) < 2:
        return 0.0
    variations = [abs(values[i] - values[i - 1]) for i in range(1, len(values))]
    return statistics.mean(variations) if variations else 0.0


class TestControlledExperiment:
    """
    Deterministic integration test with a fixed impairment profile.

    The impairment schedule is identical for both Test A and Test B.
    Only the jitter buffer toggle changes.
    """

    # Fixed experiment parameters
    PACKET_COUNT = 200
    PACKET_INTERVAL_MS = 50
    BASE_DELAY_MS = 30
    RANDOM_JITTER_MS = 40
    PACKET_LOSS_PERCENT = 0  # No loss for cleaner comparison
    SEED = 12345

    def _get_schedule(self):
        return generate_impairment_schedule(
            self.PACKET_COUNT, self.BASE_DELAY_MS,
            self.RANDOM_JITTER_MS, self.PACKET_LOSS_PERCENT,
            self.SEED
        )

    def test_schedule_is_deterministic(self):
        """Same seed produces identical schedule."""
        s1 = self._get_schedule()
        s2 = self._get_schedule()
        for i in range(self.PACKET_COUNT):
            assert s1[i]['delay_ms'] == s2[i]['delay_ms']
            assert s1[i]['drop'] == s2[i]['drop']

    def test_schedule_has_meaningful_variation(self):
        """The impairment schedule actually produces variable delays."""
        schedule = self._get_schedule()
        delays = [e['delay_ms'] for e in schedule if not e['drop']]
        assert len(set(delays)) > 10  # many distinct delay values
        assert max(delays) - min(delays) > 20  # meaningful range

    def test_a_vs_b_raw_rtt_variation_similar(self):
        """
        Raw RTT variation should be statistically similar in both tests
        since they use the same impairment schedule.
        """
        schedule = self._get_schedule()

        # Test A: no buffer
        rtt_a, _ = simulate_test(schedule, self.PACKET_INTERVAL_MS)
        variation_a = calculate_variation(rtt_a)

        # Test B: with buffer (buffer doesn't affect raw RTT measurement)
        buf = JitterBuffer(
            min_depth_ms=20, max_depth_ms=200,
            playout_interval_ms=self.PACKET_INTERVAL_MS,
        )
        rtt_b, _ = simulate_test(schedule, self.PACKET_INTERVAL_MS, buf)
        variation_b = calculate_variation(rtt_b)

        # Raw RTT variations should be identical (same impairment, same measurements)
        assert abs(variation_a - variation_b) < 0.01, \
            f"Raw RTT variation should be identical: A={variation_a:.4f}, B={variation_b:.4f}"

    def test_buffer_reduces_effective_delivery_variation(self):
        """
        For this specific controlled high-jitter scenario, the adaptive
        buffer should produce measurably lower effective delivery variation
        compared to raw arrival variation.

        This assertion is ONLY valid for this defined scenario.
        It is NOT a universal guarantee.
        """
        schedule = self._get_schedule()

        # Test A: raw arrival variation (no buffer)
        rtt_a, arrivals_a = simulate_test(schedule, self.PACKET_INTERVAL_MS)
        raw_arrival_variation = calculate_variation(arrivals_a)

        # Test B: with buffer
        buf = JitterBuffer(
            min_depth_ms=20, max_depth_ms=200,
            playout_interval_ms=self.PACKET_INTERVAL_MS,
            ewma_alpha=0.1,
            safety_factor=2.0,
        )
        rtt_b, arrivals_b = simulate_test(schedule, self.PACKET_INTERVAL_MS, buf)

        # Run playout for all buffered packets
        if buf.playout_start_time is not None:
            t = buf.playout_start_time
            for _ in range(self.PACKET_COUNT * 2):
                result = buf.playout(t)
                if result is None and len(buf.buffer) == 0:
                    break
                t += self.PACKET_INTERVAL_MS

        stats = buf.get_stats()
        effective_variation = stats['effective_delivery_variation']

        print(f"\n  [Controlled Experiment Results]")
        print(f"  Raw arrival variation:       {raw_arrival_variation:.2f} ms")
        print(f"  Effective delivery variation: {effective_variation:.2f} ms")
        print(f"  Buffer depth:                 {stats['target_depth_ms']:.2f} ms")
        print(f"  Packets played:               {stats['packets_played']}")
        print(f"  Packets dropped (late):       {stats['packets_dropped_late']}")
        print(f"  Packets missing:              {stats['packets_missing']}")

        # Assert: for this controlled scenario, effective should be
        # measurably better than raw. We don't specify a percentage —
        # we just verify the buffer actually helps.
        assert raw_arrival_variation > 0, "Raw variation should be non-zero for this impairment"
        assert effective_variation < raw_arrival_variation, \
            (f"Under the controlled demo scenario (seed={self.SEED}), "
             f"effective delivery variation ({effective_variation:.2f}ms) should be lower than "
             f"raw arrival variation ({raw_arrival_variation:.2f}ms). "
             f"If this fails, investigate the buffer implementation.")

    def test_buffer_reports_all_metrics(self):
        """Buffer stats include all required metrics."""
        schedule = self._get_schedule()
        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200,
                          playout_interval_ms=self.PACKET_INTERVAL_MS)
        simulate_test(schedule, self.PACKET_INTERVAL_MS, buf)

        # Playout
        if buf.playout_start_time is not None:
            t = buf.playout_start_time
            for _ in range(self.PACKET_COUNT * 2):
                result = buf.playout(t)
                if result is None and len(buf.buffer) == 0:
                    break
                t += self.PACKET_INTERVAL_MS

        stats = buf.get_stats()

        assert 'buffer_size' in stats
        assert 'target_depth_ms' in stats
        assert 'estimated_variation_ms' in stats
        assert 'packets_received' in stats
        assert 'packets_played' in stats
        assert 'packets_dropped_late' in stats
        assert 'packets_missing' in stats
        assert 'packets_out_of_order' in stats
        assert 'effective_delivery_variation' in stats

        # With no loss, most packets should be played
        assert stats['packets_played'] > 0


class TestExperimentWithLoss:
    """Test the experiment under packet loss conditions."""

    def test_with_packet_loss(self):
        """Buffer handles packet loss gracefully."""
        schedule = generate_impairment_schedule(
            packet_count=100, base_delay_ms=30,
            random_jitter_ms=40, packet_loss_percent=10,
            seed=54321
        )

        buf = JitterBuffer(min_depth_ms=20, max_depth_ms=200, playout_interval_ms=50)
        rtt_values, _ = simulate_test(schedule, 50, buf)

        # Playout
        if buf.playout_start_time:
            t = buf.playout_start_time
            for _ in range(200):
                result = buf.playout(t)
                if result is None and len(buf.buffer) == 0:
                    break
                t += 50

        stats = buf.get_stats()

        # With 10% loss, we should have some missing packets
        dropped_count = sum(1 for e in schedule if e['drop'])
        assert dropped_count > 0, "Schedule should have some dropped packets"

        # Buffer should report missing packets during playout
        assert stats['packets_received'] < 100  # some were dropped by server
        assert stats['packets_played'] + stats['packets_missing'] > 0


# ----------------------------------------------------------
# Run with pytest
# ----------------------------------------------------------
if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v", "-s"])  # -s to show print output
