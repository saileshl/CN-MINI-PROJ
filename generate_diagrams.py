import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('images', exist_ok=True)

# -------------------------------------------------------------
# 1. Architecture Diagram (Desktop 1400x900)
# -------------------------------------------------------------
w, h = 1400, 900
img = Image.new('RGB', (w, h), color='#FFFFFF')
d = ImageDraw.Draw(img)

# Title Header
d.rectangle([(0, 0), (w, 60)], fill='#0F172A')
d.text((w//2 - 250, 18), 'SYSTEM ARCHITECTURE: 4-TIER MODULAR DESIGN', fill='#FFFFFF')

layers = [
    ('LAYER 1: DATA ACQUISITION & HARDWARE UDP PROBING', '#EFF6FF', '#1D4ED8', [
        'Local Python Network Agent (network_agent.py) with nanosecond monotonic timing',
        'Asynchronous UDP Echo Impairment Server (udpServer.js: Port 5005)',
        'Microsecond Timestamp Embedding (time.perf_counter_ns) & Probe Sequence Generation'
    ]),
    ('LAYER 2: DATA PROCESSING & ADAPTIVE JITTER BUFFERING', '#F0FDF4', '#15803D', [
        'RFC 3550 RTP Inter-Arrival Jitter Engine: D(i, j) = (R_j - R_i) - (S_j - S_i) & EMA Smoothing',
        'Adaptive Circular Playout Buffer (jitter_buffer.py) with Dynamic Target Depth: D_target = RTT_avg + 3*sigma',
        'Late-Arrival Packet Dropping & Packet Reordering Matrix'
    ]),
    ('LAYER 3: CONTROL & ASYNCHRONOUS WEBSOCKET RELAY', '#FAF5FF', '#7E22CE', [
        'Node.js Asynchronous WebSocket Hub (server.js: Port 4000) with Event-Driven Architecture',
        'Dynamic 6-Character Session Security Pairing & Credential Manager (sessionManager.js)',
        'Synthetic Impairment Controller: Delay (0-200ms), Jitter (+-100ms), Packet Loss (0-30%)'
    ]),
    ('LAYER 4: PRESENTATION & REAL-TIME TELEMETRY DASHBOARD', '#FFFBEB', '#B45309', [
        'Next.js 16 Web Dashboard deployed on Vercel Serverless Edge Infrastructure',
        '60 FPS Catmull-Rom Cubic Spline Real-Time Canvas Waveforms (RealtimeChart.tsx)',
        'Paired A/B Experiment Telemetry Analytics & Historical JSON Export Engine'
    ])
]

y = 90
for title, bg_col, border_col, items in layers:
    d.rectangle([(80, y), (w - 80, y + 160)], fill=bg_col, outline=border_col, width=2)
    d.rectangle([(80, y), (w - 80, y + 36)], fill=border_col)
    d.text((100, y + 8), title, fill='#FFFFFF')
    
    iy = y + 50
    for item in items:
        d.text((120, iy), '-  ' + item, fill='#1E293B')
        iy += 34
    
    if y < 600:
        arr_x = w // 2
        arr_y = y + 160
        d.line([(arr_x, arr_y), (arr_x, arr_y + 35)], fill='#64748B', width=3)
        d.polygon([(arr_x - 8, arr_y + 25), (arr_x + 8, arr_y + 25), (arr_x, arr_y + 37)], fill='#64748B')
    
    y += 195

img.save('images/architecture_diagram.png')
print('architecture_diagram.png updated')

# -------------------------------------------------------------
# 2. Pipeline Flowchart (Desktop 1400x950)
# -------------------------------------------------------------
w, h = 1400, 950
img2 = Image.new('RGB', (w, h), color='#FFFFFF')
d2 = ImageDraw.Draw(img2)

d2.rectangle([(0, 0), (w, 60)], fill='#0F172A')
d2.text((w//2 - 230, 18), 'END-TO-END CONTROL & DATA PIPELINE FLOWCHART', fill='#FFFFFF')

steps = [
    ('START: User clicks [Start Test] or [Run Experiment] on Next.js Dashboard', '#1D4ED8', '#FFFFFF', False),
    ('WebSocket Relay dispatches START_TEST command to paired Python Agent', '#F8FAFC', '#334155', False),
    ('Agent dispatches sequence of 200 UDP probe packets with nanosecond timestamp S_i', '#F8FAFC', '#334155', False),
    ('UDP Server injects configured Base Delay, Random Jitter & Loss, then echoes back', '#FEF3C7', '#92400E', False),
    ('Agent receives echo packet, logs arrival timestamp R_i, and computes RTT = R_i - S_i', '#F8FAFC', '#334155', False),
    ('Compute RFC 3550 Inter-Arrival Jitter: D(i, j) = (R_j - R_i) - (S_j - S_i) & EMA Jitter', '#F8FAFC', '#334155', False),
    ('Is Adaptive Jitter Buffer Mitigation Enabled?', '#DBEAFE', '#1E40AF', True),
    ('Enqueue packet into Circular Jitter Buffer -> Schedule Playout Time: P_i = S_i + D_target', '#DCFCE7', '#166534', False),
    ('Stream telemetry batch via WebSocket to Next.js Browser Canvas Charts & Storage', '#F8FAFC', '#334155', False),
    ('END: Display 60 FPS curves, P95/P99 latency bounds, and paired A/B comparison table', '#15803D', '#FFFFFF', False),
]

y = 80
for text, bg, fg, is_diamond in steps:
    box_w = 1050
    x1 = (w - box_w) // 2
    x2 = x1 + box_w
    
    if is_diamond:
        d2.rectangle([(x1 + 120, y), (x2 - 120, y + 50)], fill=bg, outline=fg, width=2)
        d2.text((x1 + 180, y + 16), text, fill=fg)
    else:
        d2.rectangle([(x1, y), (x2, y + 50)], fill=bg, outline='#94A3B8' if bg == '#F8FAFC' else fg, width=2 if bg != '#F8FAFC' else 1)
        d2.text((x1 + 30, y + 16), text, fill=fg)
    
    if y < 780:
        arr_x = w // 2
        d2.line([(arr_x, y + 50), (arr_x, y + 80)], fill='#64748B', width=2)
        d2.polygon([(arr_x - 6, arr_y := y + 74), (arr_x + 6, arr_y), (arr_x, arr_y + 8)], fill='#64748B')
    
    y += 82

img2.save('images/pipeline_flowchart.png')
print('pipeline_flowchart.png updated')

# -------------------------------------------------------------
# 3. Jitter Buffer Flowchart (Desktop 1400x850)
# -------------------------------------------------------------
w, h = 1400, 850
img3 = Image.new('RGB', (w, h), color='#FFFFFF')
d3 = ImageDraw.Draw(img3)

d3.rectangle([(0, 0), (w, 60)], fill='#0F172A')
d3.text((w//2 - 270, 18), 'ADAPTIVE JITTER BUFFER DYNAMIC PLAYOUT ALGORITHM', fill='#FFFFFF')

steps3 = [
    ('Receive UDP Packet P_i with Sequence #, Sent Timestamp S_i, Arrival Timestamp R_i, and RTT_i', '#F8FAFC', '#1E293B'),
    ('Update Moving Exponential RTT Average: RTT_avg = alpha * RTT_avg + (1 - alpha) * RTT_i', '#F8FAFC', '#1E293B'),
    ('Compute Variance & Dynamic Playout Delay: D_target = RTT_avg + 3 * sigma_jitter', '#FEF3C7', '#92400E'),
    ('Arrival Deadline Check: Did packet arrive after scheduled playout time (R_i > S_i + D_target)?', '#DBEAFE', '#1E40AF'),
    ('YES -> DISCARD PACKET (Count as Late Drop)   |   NO -> ENQUEUE IN ORDERED CIRCULAR BUFFER', '#FEE2E2', '#991B1B'),
    ('Playout Presentation Timer Fires -> Dequeue packet at continuous smoothed playback cadence', '#DCFCE7', '#166534'),
    ('Calculate Effective Playout Delivery Variance (Smoothed Jitter Reduction Metric -> 3.2 ms)', '#EFF6FF', '#1E40AF'),
]

y = 85
for text, bg, fg in steps3:
    box_w = 1100
    x1 = (w - box_w) // 2
    x2 = x1 + box_w
    d3.rectangle([(x1, y), (x2, y + 60)], fill=bg, outline=fg, width=2)
    d3.text((x1 + 35, y + 20), text, fill=fg)
    
    if y < 650:
        arr_x = w // 2
        d3.line([(arr_x, y + 60), (arr_x, y + 95)], fill='#64748B', width=2)
        d3.polygon([(arr_x - 6, arr_y := y + 89), (arr_x + 6, arr_y), (arr_x, arr_y + 8)], fill='#64748B')
    
    y += 98

img3.save('images/jitter_buffer_flowchart.png')
print('jitter_buffer_flowchart.png updated')

# -------------------------------------------------------------
# 4. Use Case Diagram (Desktop 1400x850)
# -------------------------------------------------------------
w, h = 1400, 850
img4 = Image.new('RGB', (w, h), color='#FFFFFF')
d4 = ImageDraw.Draw(img4)

d4.rectangle([(0, 0), (w, 60)], fill='#0F172A')
d4.text((w//2 - 170, 18), 'UML SYSTEM USE CASE DIAGRAM', fill='#FFFFFF')

# System Boundary Box
d4.rectangle([(380, 85), (1020, 810)], fill='#F8FAFC', outline='#475569', width=2)
d4.text((420, 105), 'System Boundary: Network Jitter Telemetry & Reduction System', fill='#334155')

use_cases = [
    ('UC1: Pair Local Agent with 6-Character Session Code', 160),
    ('UC2: Configure Synthetic Network Impairments (Delay / Jitter / Loss)', 250),
    ('UC3: Execute High-Precision 200-Packet UDP Benchmark', 340),
    ('UC4: Enable / Disable Adaptive Jitter Buffer Mitigation', 430),
    ('UC5: Run Paired A/B Experiment Comparison', 520),
    ('UC6: Stream 60 FPS Real-Time Canvas Telemetry Waveforms', 610),
    ('UC7: Export JSON Test Records & Performance Reports', 700),
]

for uc_text, uc_y in use_cases:
    d4.ellipse([(420, uc_y - 25), (980, uc_y + 25)], fill='#FFFFFF', outline='#2563EB', width=2)
    d4.text((450, uc_y - 8), uc_text, fill='#1E293B')

# Actor 1: Network Engineer (Left)
d4.ellipse([(140, 340), (190, 390)], fill='#E2E8F0', outline='#1E293B', width=2)
d4.line([(165, 390), (165, 480)], fill='#1E293B', width=2)
d4.line([(115, 430), (215, 430)], fill='#1E293B', width=2)
d4.line([(165, 480), (125, 560)], fill='#1E293B', width=2)
d4.line([(165, 480), (205, 560)], fill='#1E293B', width=2)
d4.text((100, 580), 'Network Engineer\n(Web User)', fill='#0F172A')

# Actor 2: Python UDP Agent (Right)
d4.ellipse([(1210, 340), (1260, 390)], fill='#E2E8F0', outline='#1E293B', width=2)
d4.line([(1235, 390), (1235, 480)], fill='#1E293B', width=2)
d4.line([(1185, 430), (1285, 430)], fill='#1E293B', width=2)
d4.line([(1235, 480), (1195, 560)], fill='#1E293B', width=2)
d4.line([(1235, 480), (1275, 560)], fill='#1E293B', width=2)
d4.text((1170, 580), 'Python UDP Agent\n(Hardware Client)', fill='#0F172A')

for _, uc_y in use_cases:
    d4.line([(215, 440), (420, uc_y)], fill='#94A3B8', width=1)
    if uc_y in [160, 340, 430, 520]:
        d4.line([(980, uc_y), (1185, 440)], fill='#94A3B8', width=1)

img4.save('images/use_case_diagram.png')
print('use_case_diagram.png updated')
