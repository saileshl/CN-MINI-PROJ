'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';

interface RealtimeChartProps {
  title: string;
  unit: string;
  data: number[];
  colorTheme?: 'slate' | 'cream' | 'sage' | 'cyan' | 'emerald';
  icon?: string;
  maxPoints?: number;
  height?: number;
}

const THEMES = {
  slate: {
    primary: '#6D8196',
    secondary: '#8FA3B8',
    glow: 'rgba(109, 129, 150, 0.3)',
    fill: 'rgba(109, 129, 150, 0.12)',
    badgeBg: 'rgba(109, 129, 150, 0.12)',
    badgeBorder: 'rgba(109, 129, 150, 0.25)',
    text: '#FFFFE3',
  },
  cream: {
    primary: '#FFFFE3',
    secondary: '#CBCBCB',
    glow: 'rgba(255, 255, 227, 0.3)',
    fill: 'rgba(255, 255, 227, 0.08)',
    badgeBg: 'rgba(255, 255, 227, 0.08)',
    badgeBorder: 'rgba(255, 255, 227, 0.2)',
    text: '#FFFFE3',
  },
  sage: {
    primary: '#8EA89D',
    secondary: '#6D8196',
    glow: 'rgba(142, 168, 157, 0.3)',
    fill: 'rgba(142, 168, 157, 0.12)',
    badgeBg: 'rgba(142, 168, 157, 0.12)',
    badgeBorder: 'rgba(142, 168, 157, 0.25)',
    text: '#FFFFE3',
  },
  cyan: {
    primary: '#6D8196',
    secondary: '#8FA3B8',
    glow: 'rgba(109, 129, 150, 0.3)',
    fill: 'rgba(109, 129, 150, 0.12)',
    badgeBg: 'rgba(109, 129, 150, 0.12)',
    badgeBorder: 'rgba(109, 129, 150, 0.25)',
    text: '#FFFFE3',
  },
  emerald: {
    primary: '#8EA89D',
    secondary: '#6D8196',
    glow: 'rgba(142, 168, 157, 0.3)',
    fill: 'rgba(142, 168, 157, 0.12)',
    badgeBg: 'rgba(142, 168, 157, 0.12)',
    badgeBorder: 'rgba(142, 168, 157, 0.25)',
    text: '#FFFFE3',
  },
};

export default function RealtimeChart({
  title,
  unit,
  data,
  colorTheme = 'slate',
  icon = '📊',
  maxPoints = 120,
  height = 220,
}: RealtimeChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const dataRef = useRef<number[]>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Mouse hover state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const theme = THEMES[colorTheme] || THEMES.slate;

  // Real-time statistical metrics
  const stats = useMemo(() => {
    if (!data || data.length === 0) return { current: null, min: null, max: null, avg: null };
    const valid = data.filter(v => v !== null && !isNaN(v));
    if (valid.length === 0) return { current: null, min: null, max: null, avg: null };

    const current = valid[valid.length - 1];
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const sum = valid.reduce((acc, v) => acc + v, 0);
    const avg = sum / valid.length;

    return {
      current: current.toFixed(2),
      min: min.toFixed(1),
      max: max.toFixed(1),
      avg: avg.toFixed(1),
    };
  }, [data]);

  // Main canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let timeOffset = 0;

    const render = () => {
      timeOffset += 0.03;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      if (w === 0 || h === 0) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const pad = { top: 25, right: 20, bottom: 25, left: 45 };
      const cW = w - pad.left - pad.right;
      const cH = h - pad.top - pad.bottom;

      const currentData = dataRef.current || [];

      // Draw Standby Sine Wave if no real data yet
      if (currentData.length < 2) {
        // Subtle grid lines
        ctx.strokeStyle = 'rgba(203, 203, 203, 0.05)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const y = pad.top + (cH * i) / 4;
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(w - pad.right, y);
          ctx.stroke();
        }

        // Ambient standby wave
        ctx.beginPath();
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);

        for (let x = 0; x <= cW; x += 4) {
          const y = pad.top + cH / 2 + Math.sin(x * 0.04 + timeOffset) * (cH * 0.16);
          if (x === 0) ctx.moveTo(pad.left + x, y);
          else ctx.lineTo(pad.left + x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Standby center label
        ctx.fillStyle = '#8E929A';
        ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`STANDBY · READY TO STREAM ${unit.toUpperCase()}`, w / 2, h / 2 - 2);

        ctx.restore();
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // We have active data: Calculate Y-axis scaling
      const validData = currentData.slice(-maxPoints);
      const rawMax = Math.max(...validData, 10);
      const maxVal = Math.ceil(rawMax * 1.2 / 10) * 10 || 50;

      // Draw subtle background grid
      ctx.strokeStyle = 'rgba(203, 203, 203, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();

        // Y-axis value labels
        ctx.fillStyle = '#8E929A';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        const labelVal = (maxVal - (maxVal * i) / 4).toFixed(0);
        ctx.fillText(labelVal, pad.left - 8, y + 3);
      }

      // X-axis baseline
      ctx.strokeStyle = 'rgba(203, 203, 203, 0.08)';
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top + cH);
      ctx.lineTo(w - pad.right, pad.top + cH);
      ctx.stroke();

      // Compute data points coordinates
      const points: { x: number; y: number; val: number }[] = [];
      for (let i = 0; i < validData.length; i++) {
        const x = pad.left + (i / Math.max(validData.length - 1, 1)) * cW;
        const val = validData[i];
        const y = pad.top + cH - (Math.max(val, 0) / maxVal) * cH;
        points.push({ x, y, val });
      }

      if (points.length >= 2) {
        // 1. Smooth gradient Area Fill under curve
        const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
        areaGrad.addColorStop(0, theme.fill);
        areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.lineTo(points[points.length - 1].x, pad.top + cH);
        ctx.lineTo(points[0].x, pad.top + cH);
        ctx.closePath();

        ctx.fillStyle = areaGrad;
        ctx.fill();

        // 2. Refined stroke curve
        ctx.save();
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 0; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();
        ctx.restore();

        // 3. Live head particle
        const lastPt = points[points.length - 1];
        const pulse = Math.sin(timeOffset * 3) * 2;

        ctx.beginPath();
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 1;
        ctx.globalAlpha = Math.max(0, 1 - (pulse + 2) / 4);
        ctx.arc(lastPt.x, lastPt.y, 5 + Math.max(0, pulse + 2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#FFFFE3';
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // 4. Interactive hover cursor & tooltip
        if (hoverIndex !== null && points[hoverIndex]) {
          const hPt = points[hoverIndex];

          ctx.strokeStyle = 'rgba(203, 203, 203, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(hPt.x, pad.top);
          ctx.lineTo(hPt.x, pad.top + cH);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = theme.primary;
          ctx.beginPath();
          ctx.arc(hPt.x, hPt.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [theme, unit, maxPoints, hoverIndex]);

  // Mouse move handler for interactive crosshair
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataRef.current || dataRef.current.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pad = { top: 25, right: 20, bottom: 25, left: 45 };
    const cW = rect.width - pad.left - pad.right;

    if (x < pad.left || x > rect.width - pad.right) {
      setHoverIndex(null);
      setHoverPos(null);
      return;
    }

    const validData = dataRef.current.slice(-maxPoints);
    const ratio = (x - pad.left) / cW;
    const index = Math.min(Math.max(Math.round(ratio * (validData.length - 1)), 0), validData.length - 1);

    setHoverIndex(index);
    setHoverPos({ x, y });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setHoverPos(null);
  };

  return (
    <div className="chart-card" ref={containerRef} style={{ position: 'relative' }}>
      {/* Header Telemetry Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.1rem' }}>{icon}</span>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
              {title}
            </h3>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
              Live Telemetry Stream
            </span>
          </div>
        </div>

        {/* Live Counters Badges (shadcn style) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {stats.current !== null ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.3rem',
                  padding: '0.25rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  background: theme.badgeBg,
                  border: `1px solid ${theme.badgeBorder}`,
                }}
              >
                <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)', fontWeight: 600 }}>LIVE</span>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: theme.text }}>
                  {stats.current}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{unit}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.25rem', fontSize: '0.725rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                <span style={{ background: 'var(--bg-secondary)', padding: '0.2rem 0.45rem', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                  MIN: {stats.min}
                </span>
                <span style={{ background: 'var(--bg-secondary)', padding: '0.2rem 0.45rem', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                  AVG: {stats.avg}
                </span>
                <span style={{ background: 'var(--bg-secondary)', padding: '0.2rem 0.45rem', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                  MAX: {stats.max}
                </span>
              </div>
            </>
          ) : (
            <span className="badge badge-info" style={{ fontSize: '0.725rem' }}>
              Standby
            </span>
          )}
        </div>
      </div>

      {/* Canvas Container */}
      <div className="chart-container" style={{ height: `${height}px`, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: data && data.length >= 2 ? 'crosshair' : 'default' }}
        />

        {/* Interactive Tooltip Badge */}
        {hoverIndex !== null && hoverPos && dataRef.current && dataRef.current.length >= 2 && (
          <div
            style={{
              position: 'absolute',
              left: `${hoverPos.x}px`,
              top: '8px',
              transform: 'translateX(-50%)',
              background: '#18191E',
              border: `1px solid var(--border-strong)`,
              boxShadow: `var(--shadow-card)`,
              borderRadius: 'var(--radius-sm)',
              padding: '0.25rem 0.6rem',
              pointerEvents: 'none',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              #{hoverIndex + 1}
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#FFFFE3' }}>
              {dataRef.current.slice(-maxPoints)[hoverIndex]?.toFixed(2)} {unit}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
