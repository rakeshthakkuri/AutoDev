
════════════════════════════════════════════════════════════════════════════════
BENCHMARK COMPARISON
════════════════════════════════════════════════════════════════════════════════
  A: v1 (results-v1-baseline.json)
  B: v2 (results-v2-fixed.json)

ID     Score A  Score B   Delta   Winner
────────────────────────────────────────
A1          80       80       0      TIE
A2          53       72     +19        B
A3          77       65     -12        A
A4          79       63     -16        A
A5          90       89      -1        A
M1          63       80     +17        B
M10         68       73      +5        B
M2          63       73     +10        B
M3          78       62     -16        A
M4         100      100       0      TIE
M5          83       72     -11        A
M6          83       61     -22        A
M7          64       79     +15        B
M8          54       78     +24        B
M9          63       80     +17        B
S1          80      100     +20        B
S2         100      100       0      TIE
S3         100      100       0      TIE
S4          95       97      +2        B
S5         100       99      -1        A
────────────────────────────────────────

Metric                    v1 (results- v2 (results-    Delta
────────────────────────────────────────────────────────────
Composite Score                   78.7         81.2     +2.5
Completion Rate                     40           35       -5
Clean Rate                        96.4         98.8     +2.4
Import Consistency                79.3         81.5     +2.2
Bundle Success                      70           85      +15
Avg Duration (s)                 282.3        279.8     -2.5

  Simple: A=95 B=99 (+4)
  Intermediate: A=72 B=76 (+4)
  Advanced: A=76 B=74 (-2)

  B wins: 9/20
  A wins: 7/20
  Ties:   4/20

  ⚠️  REGRESSIONS (B scored lower): A3, A4, A5, M3, M5, M6, S5
════════════════════════════════════════════════════════════════════════════════
