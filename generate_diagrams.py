import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('images', exist_ok=True)

# -------------------------------------------------------------
# 1. Architecture Diagram
# -------------------------------------------------------------
w, h = 1000, 720
img = Image.new('RGB', (w, h), color='#FFFFFF')
d = ImageDraw.Draw(img)

d.text((w//2 - 200, 25), 'SYSTEM ARCHITECTURE: 4-LAYER DESIGN', fill='#1E293B')

layers = [
    ('1. DATA ACQUISITION & HARDWARE UDP LAYER', '#EFF6FF', '#2563EB', [
        'Local Python Agent (network_agent.py)',
        'UDP Echo Impairment Server (udpServer.js:5005)',
        'High-Resolution Monotonic Microsecond Clock (time.perf_counter_ns)'
    ]),
    ('2. DATA PROCESSING & ADAPTIVE JITTER BUFFER LAYER', '#F0FDF4', '#16A34A', [
        'RFC 3550 RTP Inter-Arrival Jitter Engine (D(i,j) & EMA Jitter)',
        'Adaptive Circular Playout Buffer (jitter_buffer.py: Dynamic Target Depth)',
        'Packet Loss & Late-Arrival Dropping / Reordering Matrix'
    ]),
    ('3. CONTROL & ASYNCHRONOUS WEBSOCKET RELAY LAYER', '#FAF5FF', '#9333EA', [
        'Fast Node.js WebSocket Hub (server.js:4000)',
        'Session & Dynamic 6-Character Pairing Manager (sessionManager.js)',
        'Synthetic Impairment Controller (Delay, Jitter, Loss Injection)'
    ]),
    ('4. PRESENTATION & TELEMETRY DASHBOARD LAYER', '#FFFBEB', '#D97706', [
        'Next.js 16 Web Dashboard & Vercel Edge Serverless Deployment',
        '60 FPS Catmull-Rom Cubic Spline Realtime Canvas Charts (RealtimeChart.tsx)',
        'A/B Paired Experiment Matrix & Historical localStorage Analytics'
    ])
]

y = 70
for title, bg_col, border_col, items in layers:
    d.rectangle([(60, y), (w - 60, y + 125)], fill=bg_col, outline=border_col, width=2)
    d.text((80, y + 12), title, fill=border_col)
    iy = y + 38
    for item in items:
        d.text((100, iy), '-  ' + item, fill='#334155')
        iy += 26
    
    if y < 450:
        arr_x = w // 2
        arr_y = y + 125
        d.line([(arr_x, arr_y), (arr_x, arr_y + 22)], fill='#64748B', width=3)
        d.polygon([(arr_x - 6, arr_y + 16), (arr_x + 6, arr_y + 16), (arr_x, arr_y + 24)], fill='#64748B')
    
    y += 150

img.save('images/architecture_diagram.png')
print('architecture_diagram.png saved')

# -------------------------------------------------------------
# 2. Pipeline Flowchart
# -------------------------------------------------------------
w, h = 1000, 800
img2 = Image.new('RGB', (w, h), color='#FFFFFF')
d2 = ImageDraw.Draw(img2)

d2.text((w//2 - 180, 20), 'END-TO-END DATA PIPELINE FLOWCHART', fill='#1E293B')

steps = [
    ('START: User clicks [Start Test] on Next.js Dashboard', '#2563EB', '#FFFFFF', False),
    ('WebSocket Relay dispatches START_TEST command to paired Python Agent', '#F1F5F9', '#1E293B', False),
    ('Agent dispatches sequence of 200 UDP packets with high-precision timestamp S_i', '#F1F5F9', '#1E293B', False),
    ('UDP Server injects configured base delay, random jitter & packet loss, then echoes back', '#FEF3C7', '#92400E', False),
    ('Agent receives echo packet, logs receive timestamp R_i, and calculates RTT = R_i - S_i', '#F1F5F9', '#1E293B', False),
    ('Compute RFC 3550 Inter-Arrival Jitter D(i, j) = (R_j - R_i) - (S_j - S_i)', '#F1F5F9', '#1E293B', False),
    ('Is Adaptive Jitter Buffer Mitigation Enabled?', '#DBEAFE', '#1E40AF', True),
    ('Enqueue packet into Adaptive Circular Jitter Buffer; compute smoothed playout time', '#DCFCE7', '#166534', False),
    ('Stream telemetry batch via WebSocket to Browser Canvas Charts & Record Results', '#F1F5F9', '#1E293B', False),
    ('END: Display live charts, P95/P99 percentiles, and paired comparison table', '#16A34A', '#FFFFFF', False),
]

y = 65
for text, bg, fg, is_diamond in steps:
    box_w = 780
    x1 = (w - box_w) // 2
    x2 = x1 + box_w
    
    if is_diamond:
        d2.rectangle([(x1 + 60, y), (x2 - 60, y + 45)], fill=bg, outline=fg, width=2)
        d2.text((x1 + 100, y + 14), text, fill=fg)
    else:
        d2.rectangle([(x1, y), (x2, y + 45)], fill=bg, outline=fg if bg == '#F1F5F9' else '#CBD5E1', width=1)
        d2.text((x1 + 20, y + 14), text, fill=fg)
    
    if y < 670:
        arr_x = w // 2
        d2.line([(arr_x, y + 45), (arr_x, y + 68)], fill='#64748B', width=2)
        d2.polygon([(arr_x - 5, y + 63), (arr_x + 5, y + 63), (arr_x, y + 70)], fill='#64748B')
    
    y += 70

img2.save('images/pipeline_flowchart.png')
print('pipeline_flowchart.png saved')

# -------------------------------------------------------------
# 3. Jitter Buffer Flowchart
# -------------------------------------------------------------
w, h = 1000, 750
img3 = Image.new('RGB', (w, h), color='#FFFFFF')
d3 = ImageDraw.Draw(img3)

d3.text((w//2 - 220, 20), 'ADAPTIVE JITTER BUFFER PLAYOUT ALGORITHM', fill='#1E293B')

steps3 = [
    ('Receive Packet P_i with Sequence #, Sent Timestamp S_i, Arrival Timestamp R_i', '#F1F5F9', '#1E293B'),
    ('Update Moving RTT Average: RTT_avg = alpha * RTT_avg + (1 - alpha) * RTT_i', '#F1F5F9', '#1E293B'),
    ('Compute Variance & Dynamic Playout Delay: D_target = RTT_avg + 3 * sigma_jitter', '#FEF3C7', '#92400E'),
    ('Check: Did Packet arrive after its Scheduled Playout Time (R_i > Playout_time)?', '#DBEAFE', '#1E40AF'),
    ('YES -> DROP PACKET (Count as Late Drop)  |  NO -> ENQUEUE IN ORDERED PLAYOUT QUEUE', '#FEE2E2', '#991B1B'),
    ('Playout Timer fires: Dequeue packet at scheduled continuous playout cadence', '#DCFCE7', '#166534'),
    ('Measure Effective Playout Delivery Variance (Smoothed jitter reduction metric)', '#EFF6FF', '#1E40AF'),
]

y = 70
for text, bg, fg in steps3:
    box_w = 840
    x1 = (w - box_w) // 2
    x2 = x1 + box_w
    d3.rectangle([(x1, y), (x2, y + 55)], fill=bg, outline=fg, width=2)
    d3.text((x1 + 25, y + 18), text, fill=fg)
    
    if y < 580:
        arr_x = w // 2
        d3.line([(arr_x, y + 55), (arr_x, y + 85)], fill='#64748B', width=2)
        d3.polygon([(arr_x - 5, y + 80), (arr_x + 5, y + 80), (arr_x, y + 87)], fill='#64748B')
    
    y += 88

img3.save('images/jitter_buffer_flowchart.png')
print('jitter_buffer_flowchart.png saved')

# -------------------------------------------------------------
# 4. Use Case Diagram
# -------------------------------------------------------------
w, h = 1000, 680
img4 = Image.new('RGB', (w, h), color='#FFFFFF')
d4 = ImageDraw.Draw(img4)

d4.text((w//2 - 160, 20), 'UML USE CASE DIAGRAM', fill='#1E293B')

# System Boundary Box
d4.rectangle([(280, 70), (740, 630)], fill='#F8FAFC', outline='#475569', width=2)
d4.text((310, 85), 'Network Jitter Measurement & Reduction System', fill='#334155')

use_cases = [
    ('UC1: Pair Agent with 6-Char Session Code', 125),
    ('UC2: Configure Synthetic Impairment (Delay/Jitter/Loss)', 200),
    ('UC3: Execute 200-Packet Live UDP Benchmark', 275),
    ('UC4: Enable / Disable Adaptive Jitter Buffer', 350),
    ('UC5: Run Paired A/B Experiment Comparison', 425),
    ('UC6: Stream Real-Time 60fps Telemetry Charts', 500),
    ('UC7: Export JSON Test & Experiment Records', 575),
]

for uc_text, uc_y in use_cases:
    d4.ellipse([(310, uc_y - 20), (710, uc_y + 20)], fill='#FFFFFF', outline='#2563EB', width=2)
    d4.text((330, uc_y - 8), uc_text, fill='#1E293B')

# Actor 1: Network Engineer / User (Left)
d4.ellipse([(80, 260), (120, 300)], fill='#E2E8F0', outline='#1E293B', width=2)
d4.line([(100, 300), (100, 370)], fill='#1E293B', width=2)
d4.line([(60, 330), (140, 330)], fill='#1E293B', width=2)
d4.line([(100, 370), (70, 430)], fill='#1E293B', width=2)
d4.line([(100, 370), (130, 430)], fill='#1E293B', width=2)
d4.text((45, 445), 'Network Engineer\n(Web User)', fill='#0F172A')

# Actor 2: Local Python Agent (Right)
d4.ellipse([(880, 260), (920, 300)], fill='#E2E8F0', outline='#1E293B', width=2)
d4.line([(900, 300), (900, 370)], fill='#1E293B', width=2)
d4.line([(860, 330), (940, 330)], fill='#1E293B', width=2)
d4.line([(900, 370), (870, 430)], fill='#1E293B', width=2)
d4.line([(900, 370), (930, 430)], fill='#1E293B', width=2)
d4.text((840, 445), 'Python UDP Agent\n(Hardware Client)', fill='#0F172A')

# Association lines
for _, uc_y in use_cases:
    d4.line([(140, 340), (310, uc_y)], fill='#94A3B8', width=1)
    if uc_y in [125, 275, 350, 425]:
        d4.line([(710, uc_y), (860, 340)], fill='#94A3B8', width=1)

img4.save('images/use_case_diagram.png')
print('use_case_diagram.png saved')
