/**
 * OddsShift-specific additions to the `popamm` (Uniswap-style) look defined in
 * `popAmmStyles.ts`. Everything here is scoped under `.popamm` and reuses that
 * file's design tokens, so the demo page reads as the same product as the FIFA
 * AMM page — only wider, because OddsShift has a chart and a judgement log to
 * show next to the swap card.
 */
export const ODDS_SHIFT_CSS = `
.popamm .os-wrap{padding:28px 18px 64px}
.popamm .os-stack{width:100%;max-width:1000px;display:flex;flex-direction:column;align-items:center}
.popamm .os-brand{display:inline-flex;align-items:center;gap:8px;margin-bottom:14px;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pp-accent);background:rgba(255,51,95,.07);border:1px solid rgba(255,51,95,.18)}
.popamm .os-hero{margin-bottom:14px}
.popamm .os-lede{max-width:690px;margin:0 0 26px;text-align:center;font-size:14px;font-weight:500;line-height:1.65;color:var(--pp-muted)}
.popamm .os-lede b{font-weight:800;color:var(--pp-text)}
.popamm .os-lede em{font-style:normal;font-weight:700;color:var(--pp-accent)}

.popamm .os-grid{width:100%;display:grid;grid-template-columns:minmax(0,1fr) 472px;gap:16px;align-items:start}
.popamm .os-col{display:flex;flex-direction:column;gap:16px;min-width:0}
@media (max-width:1040px){
  .popamm .os-grid{grid-template-columns:minmax(0,1fr);max-width:472px;margin:0 auto}
  .popamm .os-col-trade{order:-1}
}

.popamm .pp-card.os-card{width:100%;max-width:100%;padding:18px 20px}
.popamm .os-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
.popamm .os-h-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--pp-muted)}
.popamm .os-num{font-variant-numeric:tabular-nums}
.popamm .os-strong{font-weight:800}
.popamm .os-big{font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;color:var(--pp-text)}
.popamm .os-mid{font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums;color:var(--pp-text)}
.popamm .os-sub{font-size:12px;font-weight:600;line-height:1.65;color:var(--pp-muted)}
.popamm .os-sub-r{text-align:right;font-variant-numeric:tabular-nums}
.popamm .os-empty{font-size:13px;font-weight:600;line-height:1.6;color:var(--pp-muted)}
.popamm .os-addr{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;color:var(--pp-muted);background:rgba(108,108,115,.07);border-radius:999px;padding:5px 11px;word-break:break-all}

.popamm .os-badge{flex:none;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;white-space:nowrap}
.popamm .os-badge-neutral{background:rgba(108,108,115,.10);color:var(--pp-muted)}
.popamm .os-badge-ok{background:rgba(21,128,61,.10);color:var(--pp-yes)}
.popamm .os-badge-info{background:rgba(0,122,255,.08);color:#007AFF}
.popamm .os-badge-warn{background:rgba(255,149,0,.12);color:#B26A00}
.popamm .os-badge-bad{background:rgba(233,21,45,.08);color:var(--pp-no)}

.popamm .os-list{list-style:none;margin:0;padding:0}
.popamm .os-item{background:#fff;border:1px solid var(--pp-line);border-radius:18px;padding:11px 14px}
.popamm .os-item+.os-item{margin-top:8px}
.popamm .os-item-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700}
.popamm .os-item-head>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.popamm .os-item-sub{margin-top:4px;font-size:12px;font-weight:600;color:var(--pp-muted);font-variant-numeric:tabular-nums}
.popamm .os-item-note{margin-top:4px;font-size:12px;font-weight:600;line-height:1.5;color:var(--pp-no)}
.popamm .os-up{color:var(--pp-yes)}
.popamm .os-down{color:var(--pp-no)}

.popamm button.os-ghost{width:100%;background:#fff;border:1px solid var(--pp-line);color:var(--pp-text);border-radius:16px;padding:11px 14px;font-size:14px;font-weight:700;transition:border-color .15s,color .15s}
.popamm button.os-ghost:hover:not(:disabled){border-color:var(--pp-accent);color:var(--pp-accent)}
.popamm button.os-ghost:disabled{opacity:.4}
.popamm button.os-claimbtn{width:100%;text-align:left;transition:border-color .15s}
.popamm button.os-claimbtn:hover:not(:disabled){border-color:var(--pp-accent)}
.popamm button.os-claimbtn:disabled{opacity:.45}
.popamm .os-claim-amt{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--pp-text)}

/* ── probability chart ─────────────────────────────────────────────────── */
.popamm .os-chart{width:100%;margin-top:14px;overflow:visible}
.popamm .os-chart-grid{stroke:var(--pp-line);stroke-width:1;stroke-dasharray:3 5}
.popamm .os-chart-band{fill:rgba(255,149,0,.09)}
.popamm .os-chart-anchor{stroke:#FF9500;stroke-width:1.5;stroke-dasharray:5 4}
.popamm .os-chart-anchor-t{fill:#B26A00;font-size:11px;font-weight:700}
.popamm .os-chart-line{stroke:var(--pp-accent);stroke-width:2.5;fill:none;stroke-linejoin:round;stroke-linecap:round}
.popamm .os-chart-area{fill:url(#os-grad)}
.popamm .os-chart-dot{fill:var(--pp-accent);stroke:#fff;stroke-width:2}
.popamm .os-mark{stroke:#fff;stroke-width:2}
.popamm .os-mark-open{fill:#FF9500}
.popamm .os-mark-reverted{fill:var(--pp-yes)}
.popamm .os-mark-toxic{fill:var(--pp-no)}
`
