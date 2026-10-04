/**
 * Judge-facing Robinhood / OddsShift evidence surface.
 * Extends the existing `popamm` design tokens — not a parallel redesign.
 */
export const ROBINHOOD_EVIDENCE_CSS = `
.popamm .rh-wrap{padding:24px 18px 72px;width:100%}
.popamm .rh-evidence-below{padding-top:8px;border-top:1px solid var(--pp-line);margin-top:8px}
.popamm .rh-evidence-hero{font-size:clamp(20px,3.4vw,30px)}
.popamm .rh-stack{width:100%;max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
.popamm .os-embedded .os-wrap{padding-top:12px;padding-bottom:28px}
.popamm .rh-eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 auto 8px;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--pp-accent);background:rgba(255,51,95,.07);border:1px solid rgba(255,51,95,.18)}
.popamm .rh-hero{margin:0;text-align:center;font-size:clamp(22px,4vw,36px);font-weight:700;letter-spacing:-.03em;line-height:1.1}
.popamm .rh-lede{margin:0 auto;max-width:720px;text-align:center;font-size:14px;font-weight:500;line-height:1.65;color:var(--pp-muted)}
.popamm .rh-lede b{color:var(--pp-text);font-weight:800}

.popamm .rh-card{width:100%;background:rgba(255,255,255,.94);border:1px solid var(--pp-line);border-radius:28px;padding:20px 22px;box-shadow:var(--pp-shadow);backdrop-filter:blur(18px)}
.popamm .rh-card-title{margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--pp-muted)}
.popamm .rh-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.popamm .rh-card-h{margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em;color:var(--pp-text)}
.popamm .rh-card-sub{margin:4px 0 0;font-size:13px;font-weight:600;line-height:1.55;color:var(--pp-muted);max-width:62ch}

/* ── deployment header ───────────────────────────────────────────────── */
.popamm .rh-header{display:flex;flex-direction:column;gap:16px}
.popamm .rh-badges{display:flex;flex-wrap:wrap;gap:8px}
.popamm .rh-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border:1px solid transparent}
.popamm .rh-badge-live{background:rgba(21,128,61,.10);color:var(--pp-yes);border-color:rgba(21,128,61,.22)}
.popamm .rh-badge-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--pp-yes);box-shadow:0 0 0 0 rgba(21,128,61,.45);animation:rh-pulse 1.8s ease-out infinite}
.popamm .rh-badge-net{background:rgba(0,122,255,.08);color:#007AFF;border-color:rgba(0,122,255,.18)}
.popamm .rh-badge-token{background:rgba(255,51,95,.07);color:var(--pp-accent);border-color:rgba(255,51,95,.18)}
.popamm .rh-badge-verify{background:rgba(21,128,61,.08);color:var(--pp-yes);border-color:rgba(21,128,61,.18)}
@keyframes rh-pulse{0%{box-shadow:0 0 0 0 rgba(21,128,61,.45)}70%{box-shadow:0 0 0 8px rgba(21,128,61,0)}100%{box-shadow:0 0 0 0 rgba(21,128,61,0)}}
@media (prefers-reduced-motion:reduce){
  .popamm .rh-badge-live::before{animation:none}
}

.popamm .rh-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}
@media (max-width:720px){.popamm .rh-meta{grid-template-columns:1fr}}
.popamm .rh-meta-row{display:flex;flex-direction:column;gap:3px;min-width:0}
.popamm .rh-meta-k{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pp-muted)}
.popamm .rh-meta-v{font-size:13px;font-weight:700;color:var(--pp-text);word-break:break-word}
.popamm .rh-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700}
.popamm .rh-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px}
.popamm .rh-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:14px;padding:10px 14px;font-size:13px;font-weight:800;text-decoration:none;border:1px solid var(--pp-line);background:#fff;color:var(--pp-text);transition:border-color .15s,color .15s,background .15s}
.popamm .rh-btn:hover{border-color:var(--pp-accent);color:var(--pp-accent)}
.popamm .rh-btn-primary{background:var(--pp-accent);border-color:var(--pp-accent);color:#fff}
.popamm .rh-btn-primary:hover{opacity:.92;color:#fff}
.popamm .rh-copy{border:0;cursor:pointer;font:inherit}
.popamm .rh-copy:focus-visible{outline:2px solid var(--pp-accent);outline-offset:2px}

.popamm .rh-status-ok{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:16px;background:rgba(21,128,61,.08);border:1px solid rgba(21,128,61,.22);color:var(--pp-yes);font-size:13px;font-weight:800}
.popamm .rh-status-warn{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:16px;background:rgba(255,149,0,.10);border:1px solid rgba(255,149,0,.28);color:#B26A00;font-size:13px;font-weight:700}

/* ── accounting metrics ──────────────────────────────────────────────── */
.popamm .rh-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:900px){.popamm .rh-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:480px){.popamm .rh-metrics{grid-template-columns:1fr}}
.popamm .rh-metric{background:#fff;border:1px solid var(--pp-line);border-radius:20px;padding:14px 16px;min-width:0}
.popamm .rh-metric-v{font-size:clamp(22px,3vw,30px);font-weight:800;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;color:var(--pp-text)}
.popamm .rh-metric-k{margin-top:8px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pp-muted)}
.popamm .rh-metric-accent .rh-metric-v{color:var(--pp-accent)}
.popamm .rh-metric-ok .rh-metric-v{color:var(--pp-yes)}
.popamm .rh-metric-bad .rh-metric-v{color:var(--pp-no)}
.popamm .rh-zero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}
@media (max-width:720px){.popamm .rh-zero{grid-template-columns:repeat(2,minmax(0,1fr))}}
.popamm .rh-zero-item{background:rgba(21,128,61,.05);border:1px solid rgba(21,128,61,.16);border-radius:16px;padding:12px 14px}
.popamm .rh-zero-v{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--pp-yes)}
.popamm .rh-zero-k{margin-top:4px;font-size:11px;font-weight:700;color:var(--pp-muted)}

/* ── mechanism ───────────────────────────────────────────────────────── */
.popamm .rh-flow{display:flex;flex-direction:column;align-items:stretch;gap:10px}
.popamm .rh-flow-node{align-self:center;background:#fff;border:1px solid var(--pp-line);border-radius:16px;padding:10px 16px;font-size:13px;font-weight:800;text-align:center}
.popamm .rh-flow-arrow{align-self:center;color:var(--pp-muted);font-size:16px;line-height:1}
.popamm .rh-flow-split{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:640px){.popamm .rh-flow-split{grid-template-columns:1fr}}
.popamm .rh-flow-branch{border-radius:18px;padding:14px;border:1px solid var(--pp-line);background:#fff}
.popamm .rh-flow-branch-ok{border-color:rgba(21,128,61,.28);background:rgba(21,128,61,.04)}
.popamm .rh-flow-branch-bad{border-color:rgba(233,21,45,.22);background:rgba(233,21,45,.04)}
.popamm .rh-flow-branch h4{margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.popamm .rh-flow-branch p{margin:0;font-size:13px;font-weight:600;line-height:1.5;color:var(--pp-muted)}
.popamm .rh-params{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.popamm .rh-param{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 11px;background:rgba(108,108,115,.07);font-size:12px;font-weight:700;color:var(--pp-text)}
.popamm .rh-tip{display:inline-flex;margin-left:4px}

/* ── scenario cards ──────────────────────────────────────────────────── */
.popamm .rh-scenarios{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:900px){.popamm .rh-scenarios{grid-template-columns:1fr}}
.popamm .rh-scenario{display:flex;flex-direction:column;gap:12px}
.popamm .rh-scenario-fair{border-top:3px solid var(--pp-yes)}
.popamm .rh-scenario-toxic{border-top:3px solid var(--pp-no)}
.popamm .rh-outcome{display:inline-flex;align-self:flex-start;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.popamm .rh-outcome-ok{background:rgba(21,128,61,.10);color:var(--pp-yes)}
.popamm .rh-outcome-bad{background:rgba(233,21,45,.08);color:var(--pp-no)}
.popamm .rh-path{display:flex;flex-wrap:wrap;align-items:center;gap:6px 4px}
.popamm .rh-path-step{font-variant-numeric:tabular-nums;font-size:13px;font-weight:800;padding:5px 9px;border-radius:10px;background:rgba(108,108,115,.07);color:var(--pp-text)}
.popamm .rh-path-step-mark{background:rgba(255,149,0,.14);color:#B26A00}
.popamm .rh-path-step-ok{background:rgba(21,128,61,.12);color:var(--pp-yes)}
.popamm .rh-path-step-bad{background:rgba(233,21,45,.10);color:var(--pp-no)}
.popamm .rh-path-arrow{color:var(--pp-muted);font-size:12px;font-weight:700}
.popamm .rh-marker{margin-top:2px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.popamm .rh-marker-shock{color:#B26A00}
.popamm .rh-marker-ok{color:var(--pp-yes)}
.popamm .rh-marker-bad{color:var(--pp-no)}
.popamm .rh-scenario p{margin:0;font-size:13px;font-weight:600;line-height:1.6;color:var(--pp-muted)}

/* timeline spark  */
.popamm .rh-spark{width:100%;height:auto;margin-top:4px;overflow:visible}
.popamm .rh-spark-line{fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.popamm .rh-spark-fair{stroke:var(--pp-yes)}
.popamm .rh-spark-toxic{stroke:var(--pp-no)}
.popamm .rh-spark-area-fair{fill:rgba(21,128,61,.10)}
.popamm .rh-spark-area-toxic{fill:rgba(233,21,45,.08)}
.popamm .rh-spark-mark{stroke:#fff;stroke-width:2}
@media (prefers-reduced-motion:no-preference){
  .popamm .rh-spark-line{stroke-dasharray:800;stroke-dashoffset:800;animation:rh-draw .9s ease forwards}
}
@keyframes rh-draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){
  .popamm .rh-spark-line{stroke-dasharray:none;animation:none}
}

/* ── contribution card ───────────────────────────────────────────────── */
.popamm .rh-contrib{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;align-items:start}
@media (max-width:800px){.popamm .rh-contrib{grid-template-columns:1fr}}
.popamm .rh-contrib-flows{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:520px){.popamm .rh-contrib-flows{grid-template-columns:1fr}}
.popamm .rh-contrib-col{border-radius:18px;padding:14px;border:1px solid var(--pp-line);background:#fff}
.popamm .rh-contrib-col ol{margin:10px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.popamm .rh-contrib-col li{display:flex;flex-direction:column;gap:2px}
.popamm .rh-contrib-col .rh-step{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.popamm .rh-contrib-col .rh-step-sub{font-size:12px;font-weight:600;color:var(--pp-muted)}

/* ── evidence drawer ─────────────────────────────────────────────────── */
.popamm .rh-details{border:1px solid var(--pp-line);border-radius:24px;background:rgba(255,255,255,.94);overflow:hidden;box-shadow:var(--pp-shadow)}
.popamm .rh-details>summary{cursor:pointer;list-style:none;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:15px;font-weight:800}
.popamm .rh-details>summary::-webkit-details-marker{display:none}
.popamm .rh-details>summary::after{content:"▾";color:var(--pp-muted);transition:transform .15s}
.popamm .rh-details[open]>summary::after{transform:rotate(180deg)}
.popamm .rh-details-body{padding:0 22px 20px;display:flex;flex-direction:column;gap:18px}
.popamm .rh-ev-group h3{margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--pp-muted)}
.popamm .rh-ev-group p{margin:0 0 10px;font-size:12px;font-weight:600;color:var(--pp-muted)}
.popamm .rh-ev-table{width:100%;border-collapse:collapse}
.popamm .rh-ev-table th{text-align:left;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pp-muted);padding:0 0 8px;border-bottom:1px solid var(--pp-line)}
.popamm .rh-ev-table td{padding:10px 8px 10px 0;border-bottom:1px solid rgba(20,20,20,.06);font-size:13px;font-weight:600;vertical-align:top}
.popamm .rh-ev-table tr:last-child td{border-bottom:0}
.popamm .rh-ev-action{color:var(--pp-text);font-weight:700}
.popamm .rh-ev-hash{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--pp-muted);white-space:nowrap}
.popamm .rh-ev-result{color:var(--pp-muted);max-width:280px}
.popamm .rh-ev-link{color:var(--pp-accent);font-weight:800;text-decoration:none;white-space:nowrap}
.popamm .rh-ev-link:hover{text-decoration:underline}
.popamm .rh-ev-hi-shock td{background:rgba(255,149,0,.06)}
.popamm .rh-ev-hi-correction td,.popamm .rh-ev-hi-rebate td{background:rgba(21,128,61,.05)}
.popamm .rh-ev-hi-resolution td,.popamm .rh-ev-hi-payout td{background:rgba(0,122,255,.04)}
@media (max-width:700px){
  .popamm .rh-ev-table th:nth-child(3),.popamm .rh-ev-table td:nth-child(3){display:none}
}

/* ── engineering ─────────────────────────────────────────────────────── */
.popamm .rh-eng-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (max-width:800px){.popamm .rh-eng-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:480px){.popamm .rh-eng-grid{grid-template-columns:1fr}}
.popamm .rh-eng-item{background:#fff;border:1px solid var(--pp-line);border-radius:16px;padding:12px 14px}
.popamm .rh-eng-k{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pp-muted)}
.popamm .rh-eng-v{margin-top:6px;font-size:14px;font-weight:800;color:var(--pp-text);word-break:break-word}
.popamm .rh-note{margin:12px 0 0;font-size:12px;font-weight:600;line-height:1.55;color:var(--pp-muted)}
`
