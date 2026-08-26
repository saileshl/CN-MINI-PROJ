"""
Adaptive Jitter Buffer — Application-Level Mitigation
======================================================
Buffers incoming UDP packets and releases them on a controlled
playout schedule to reduce the EFFECT of variable arrival times
on application-level delivery.

DOES NOT reduce physical network jitter (ISP, Wi-Fi, router).
Only smooths application-layer packet delivery.

Concepts:
  - Incoming packets arrive with variable inter-arrival times
  - Buffer stores them ordered by sequence number
  - EWMA estimates current delay variation
  - Buffer depth adapts dynamically (clamped min/max)
  - Packets released at steady playout intervals
  - Late packets (past deadline) are dropped
"""

import time
import math
from collections import OrderedDict


class JitterBuffer:
    """Adaptive jitter buffer for application-level jitter mitigation."""

    def __init__(self, min_depth_ms=20, max_depth_ms=200, safety_factor=2.0,
                 ewma_alpha=0.1, playout_interval_ms=50):
        # Configuration
        self.min_depth_ms = min_depth_ms
        self.max_depth_ms = max_depth_ms
        self.safety_factor = safety_factor
        self.ewma_alpha = ewma_alpha
        self.playout_interval_ms = playout_interval_ms

        # State
        self.buffer = OrderedDict()      # seq -> { arrival_time, data }
        self.expected_seq = 1
        self.max_seq_seen = 0            # highest seq received (for OOO detection)
        self.estimated_variation = 0.0   # EWMA of inter-arrival variation
        self.target_depth_ms = min_depth_ms
        self.prev_arrival_time = None

        # Playout state
        self.playout_start_time = None
        self.playout_count = 0

        # Statistics
        self.stats = {
            'packets_received': 0,
            'packets_played': 0,
            'packets_dropped_late': 0,
            'packets_missing': 0,
            'packets_out_of_order': 0,
            'playout_times': [],         # actual playout timestamps (for effective variation calc)
            'arrival_times': [],         # arrival timestamps (for raw variation)
        }

    def reset(self):
        """Reset buffer state for a new test."""
        self.buffer.clear()
        self.expected_seq = 1
        self.max_seq_seen = 0
        self.estimated_variation = 0.0
        self.target_depth_ms = self.min_depth_ms
        self.prev_arrival_time = None
        self.playout_start_time = None
        self.playout_count = 0
        self.stats = {
            'packets_received': 0,
            'packets_played': 0,
            'packets_dropped_late': 0,
            'packets_missing': 0,
            'packets_out_of_order': 0,
            'playout_times': [],
            'arrival_times': [],
        }

    def receive_packet(self, seq, arrival_time_ms, data=None):
        """
        Add a received packet to the buffer.

        Args:
            seq: Packet sequence number
            arrival_time_ms: Arrival timestamp in ms
            data: Optional packet data payload

        Returns:
            dict with receive status info
        """
        self.stats['packets_received'] += 1
        self.stats['arrival_times'].append(arrival_time_ms)

        # Track inter-arrival variation for adaptive depth
        if self.prev_arrival_time is not None:
            inter_arrival = arrival_time_ms - self.prev_arrival_time
            expected_interval = self.playout_interval_ms
            variation = abs(inter_arrival - expected_interval)

            # EWMA update
            self.estimated_variation = (
                self.ewma_alpha * variation +
                (1 - self.ewma_alpha) * self.estimated_variation
            )

            # Adapt buffer depth
            self._adapt_depth()

        self.prev_arrival_time = arrival_time_ms

        # Out-of-order detection: packet seq less than the highest we've seen
        out_of_order = False
        if seq < self.max_seq_seen:
            out_of_order = True
            self.stats['packets_out_of_order'] += 1
        self.max_seq_seen = max(self.max_seq_seen, seq)

        # Initialize playout timeline on first packet
        if self.playout_start_time is None:
            self.playout_start_time = arrival_time_ms + self.target_depth_ms

        # Check if packet is too late for playout
        playout_deadline = self._get_playout_deadline(seq)
        if arrival_time_ms > playout_deadline:
            self.stats['packets_dropped_late'] += 1
            return {
                'status': 'dropped_late',
                'seq': seq,
                'arrival_time_ms': arrival_time_ms,
                'deadline_ms': playout_deadline,
                'late_by_ms': arrival_time_ms - playout_deadline,
            }

        # Add to buffer
        self.buffer[seq] = {
            'arrival_time': arrival_time_ms,
            'data': data,
        }

        # Sort buffer by seq when out-of-order packet is inserted
        if out_of_order:
            sorted_items = sorted(self.buffer.items())
            self.buffer.clear()
            self.buffer.update(sorted_items)

        return {
            'status': 'buffered',
            'seq': seq,
            'out_of_order': out_of_order,
            'buffer_size': len(self.buffer),
            'target_depth_ms': self.target_depth_ms,
        }

    def playout(self, current_time_ms):
        """
        Attempt to play out the next packet at the scheduled time.

        Args:
            current_time_ms: Current time in ms

        Returns:
            dict with playout result, or None if not time yet
        """
        if self.playout_start_time is None:
            return None

        # Calculate when the next packet should be played
        next_playout_time = self.playout_start_time + (self.playout_count * self.playout_interval_ms)

        if current_time_ms < next_playout_time:
            return None  # Not time yet

        target_seq = self.expected_seq

        if target_seq in self.buffer:
            # Packet available — play it out
            packet = self.buffer.pop(target_seq)
            self.stats['packets_played'] += 1
            self.stats['playout_times'].append(current_time_ms)
            self.expected_seq += 1
            self.playout_count += 1

            return {
                'status': 'played',
                'seq': target_seq,
                'playout_time_ms': current_time_ms,
                'scheduled_time_ms': next_playout_time,
                'data': packet['data'],
            }
        else:
            # Packet missing at playout time
            self.stats['packets_missing'] += 1
            self.expected_seq += 1
            self.playout_count += 1

            return {
                'status': 'missing',
                'seq': target_seq,
                'playout_time_ms': current_time_ms,
            }

    def _adapt_depth(self):
        """Dynamically adjust buffer depth based on estimated variation."""
        raw_depth = self.estimated_variation * self.safety_factor
        self.target_depth_ms = max(
            self.min_depth_ms,
            min(self.max_depth_ms, raw_depth)
        )

    def _get_playout_deadline(self, seq):
        """Calculate the playout deadline for a given sequence number."""
        if self.playout_start_time is None:
            return float('inf')

        # The packet's scheduled playout time + generous grace period
        # Grace = target_depth + playout_interval to accommodate late/OOO arrivals
        packets_ahead = seq - self.expected_seq
        scheduled_time = (self.playout_start_time +
                          (self.playout_count + max(0, packets_ahead)) * self.playout_interval_ms)
        grace = self.target_depth_ms + self.playout_interval_ms
        return scheduled_time + grace

    def get_stats(self):
        """Return current buffer statistics."""
        return {
            'buffer_size': len(self.buffer),
            'target_depth_ms': round(self.target_depth_ms, 2),
            'estimated_variation_ms': round(self.estimated_variation, 2),
            'packets_received': self.stats['packets_received'],
            'packets_played': self.stats['packets_played'],
            'packets_dropped_late': self.stats['packets_dropped_late'],
            'packets_missing': self.stats['packets_missing'],
            'packets_out_of_order': self.stats['packets_out_of_order'],
            'effective_delivery_variation': self._calc_effective_variation(),
        }

    def _calc_effective_variation(self):
        """
        Calculate effective delivery variation from actual playout times.
        This is the variation of playout inter-intervals vs ideal.
        """
        times = self.stats['playout_times']
        if len(times) < 2:
            return 0.0

        variations = []
        for i in range(1, len(times)):
            inter_playout = times[i] - times[i - 1]
            variation = abs(inter_playout - self.playout_interval_ms)
            variations.append(variation)

        return round(sum(variations) / len(variations), 4) if variations else 0.0
