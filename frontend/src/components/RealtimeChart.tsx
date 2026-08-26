'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';

interface RealtimeChartProps {
  title: string;
  unit: string;
  data: number[];
  colorTheme: 'cyan' | 'emerald' | 'indigo' | 'amber';
  icon?: string;
  maxPoints?: number;
  height?: number;
}

const THEMES = {
  cyan: {
    primary: '#00f0ff',
    secondary: '#6366f1',
    glow: 'rgba(0, 240, 255, 0.4)',
    fill: 'rgba(0, 240, 255, 0.22)',
    badgeBg: 'rgba(0, 240, 255, 0.1)',
    badgeBorder: 'rgba(0, 240, 255, 0.3)',
    text: '#00f0ff',
  },
  emerald: {
    primary: '#10b981',
    secondary: '#06b6d4',
    glow: 'rgba(16, 185, 129, 0.4)',
    fill: 'rgba(16, 185, 129, 0.22)',
    badgeBg: 'rgba(16, 185, 129, 0.1)',
    badgeBorder: 'rgba(16, 185, 129, 0.3)',
    text: '#34d399',
  },
  indigo: {
    primary: '#818cf8',
    secondary: '#c084fc',
    glow: 'rgba(129, 140, 248, 0.4)',
    fill: 'rgba(129, 140, 248, 0.22)',
    badgeBg: 'rgba(129, 140, 248, 0.1)',
    badgeBorder: 'rgba(129, 140, 248, 0.3)',
    text: '#a5b4fc',
  },
  amber: {
    primary: '#f59e0b',
    secondary: '#f43f5e',
    glow: 'rgba(245, 158, 11, 0.4)',
    fill: 'rgba(245, 158, 11, 0.22)',
    badgeBg: 'rgba(245, 158, 11, 0.1)',
    badgeBorder: 'rgba(245, 158, 11, 0.3)',
    text: '#fbbf24',
  },
};

export default function RealtimeChart({
  title,
  unit,
  data,
  colorTheme = 'cyan',
  icon = '📈',
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

  const theme = THEMES[colorTheme] || THEMES.cyan;

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
      timeOffset += 0.04;
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
        // Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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
        ctx.strokeStyle = theme.glow;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        for (let x = 0; x <= cW; x += 4) {
          const y = pad.top + cH / 2 + Math.sin(x * 0.05 + timeOffset) * (cH * 0.18);
          if (x === 0) ctx.moveTo(pad.left + x, y);
          else ctx.lineTo(pad.left + x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Standby center badge
        ctx.fillStyle = theme.text;
        ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`⚡ STANDBY · READY TO STREAM ${unit.toUpperCase()}`, w / 2, h / 2 - 2);

        ctx.restore();
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // We have active data: Calculate Y-axis scaling
      const validData = currentData.slice(-maxPoints);
      const rawMax = Math.max(...validData, 10);
      const maxVal = Math.ceil(rawMax * 1.2 / 10) * 10 || 50;

      // Draw subtle background grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (cH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();

        // Y-axis value labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        const labelVal = (maxVal - (maxVal * i) / 4).toFixed(0);
        ctx.fillText(labelVal, pad.left - 8, y + 3);
      }

      // X-axis baseline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
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
        // 1. Draw smooth gradient Area Fill under curve
        const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH);
        areaGrad.addColorStop(0, theme.fill);
        areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        // Smooth cubic spline curve
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

        // 2. Draw glowing outer line
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = theme.primary;

        const lineGrad = ctx.createLinearGradient(pad.left, 0, pad.left + cW, 0);
        lineGrad.addColorStop(0, theme.secondary);
        lineGrad.addColorStop(1, theme.primary);

        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2.5;
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

        // 3. Draw live head particle with pulsating radar ring
        const lastPt = points[points.length - 1];
        const pulse = Math.sin(timeOffset * 4) * 3;

        // Expanding radar wave
        ctx.beginPath();
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = Math.max(0, 1 - (pulse + 3) / 6);
        ctx.arc(lastPt.x, lastPt.y, 6 + Math.max(0, pulse + 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Core glowing dot
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = theme.primary;
        ctx.beginPath();
        ctx.arc(lastPt.x, lastPt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 4. Draw interactive hover cursor & tooltip if hovering
        if (hoverIndex !== null && points[hoverIndex]) {
          const hPt = points[hoverIndex];

          // Vertical crosshair
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(hPt.x, pad.top);
          ctx.lineTo(hPt.x, pad.top + cH);
          ctx.stroke();
          ctx.setLineDash([]);

          // Hover highlight point
          ctx.fillStyle = theme.primary;
          ctx.beginPath();
          ctx.arc(hPt.x, hPt.y, 5, 0, Math.PI * 2);
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
  }, [data, theme, unit, maxPoints, hoverIndex]);

  // Mouse move handler for interactive crosshair
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;

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

    const validData = data.slice(-maxPoints);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.25rem' }}>{icon}</span>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {title}
            </h3>
            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
              Live UDP Stream Telemetry
            </span>
          </div>
        </div>

        {/* Live Counters Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {stats.current !== null ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.25rem',
                  padding: '0.3rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  background: theme.badgeBg,
                  border: `1px solid ${theme.badgeBorder}`,
                }}
              >
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>LIVE</span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: theme.text }}>
                  {stats.current}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{unit}</span>
              </div>

              <div style={{ display: 'flex', gap: '0.35rem', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                <span style={{ background: 'rgba(255,255,255,0.04)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                  MIN: {stats.min}
                </span>
                <span style={{ background: 'rgba(255,255,255,0.04)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                  AVG: {stats.avg}
                </span>
                <span style={{ background: 'rgba(255,255,255,0.04)', padding: '0.2rem 0.5rem', borderRadius: 4 }}>
                  MAX: {stats.max}
                </span>
              </div>
            </>
          ) : (
            <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
              ⚡ Standby
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
        {hoverIndex !== null && hoverPos && data && data.length >= 2 && (
          <div
            style={{
              position: 'absolute',
              left: `${hoverPos.x}px`,
              top: '10px',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${theme.primary}`,
              boxShadow: `0 4px 20px ${theme.glow}`,
              borderRadius: 'var(--radius-sm)',
              padding: '0.35rem 0.75rem',
              pointerEvents: 'none',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              # {hoverIndex + 1}
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#ffffff' }}>
              {data.slice(-maxPoints)[hoverIndex]?.toFixed(2)} {unit}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
