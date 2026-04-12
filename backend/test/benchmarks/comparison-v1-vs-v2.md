
════════════════════════════════════════════════════════════════════════════════
BENCHMARK COMPARISON
════════════════════════════════════════════════════════════════════════════════
  A: v1 (results-v1-baseline.json)
  B: v2 (results-v2-baseline.json)

ID     Score A  Score B   Delta   Winner
────────────────────────────────────────
A1          80       71      -9        A
A2          53       68     +15        B
A3          77       80      +3        B
A4          79      100     +21        B
A5          90       53     -37        A
M1          63       84     +21        B
M10         68       92     +24        B
M2          63       58      -5        A
M3          78       59     -19        A
M4         100      100       0      TIE
M5          83       82      -1        A
M6          83       61     -22        A
M7          64       80     +16        B
M8          54       80     +26        B
M9          63       72      +9        B
S1          80      100     +20        B
S2         100       89     -11        A
S3         100      100       0      TIE
S4          95       98      +3        B
S5         100       99      -1        A
────────────────────────────────────────

Metric                    v1 (results- v2 (results-    Delta
────────────────────────────────────────────────────────────
Composite Score                   78.7         81.3     +2.6
Completion Rate                     40           50      +10
Clean Rate                        96.4         98.7     +2.3
Import Consistency                79.3         77.2     -2.1
Bundle Success                      70           75       +5
Avg Duration (s)                 282.3        274.4     -7.9

  Simple: A=95 B=97 (+2)
  Intermediate: A=72 B=77 (+5)
  Advanced: A=76 B=74 (-2)

  B wins: 10/20
  A wins: 8/20
  Ties:   2/20

  ⚠️  REGRESSIONS (B scored lower): A1, A5, M2, M3, M5, M6, S2, S5
════════════════════════════════════════════════════════════════════════════════
