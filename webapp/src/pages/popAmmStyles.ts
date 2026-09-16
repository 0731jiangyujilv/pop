export const POP_AMM_CSS = `
.popamm{
  --pp-card:#fff;--pp-soft:rgba(255,51,95,0.04);--pp-line:rgba(20,20,20,0.12);
  --pp-text:#141414;--pp-muted:#6c6c73;--pp-accent:#FF335F;
  --pp-yes:#15803d;--pp-no:rgb(233,21,45);--pp-shadow:0 24px 60px rgba(20,20,20,.08);
  min-height:100vh;display:flex;flex-direction:column;color:var(--pp-text);
  background:radial-gradient(circle at top left,rgba(255,51,95,.08),transparent 24%),
             radial-gradient(circle at 85% 20%,rgba(255,51,95,.06),transparent 18%),
             var(--color-bg-0);
}
.popamm *{box-sizing:border-box}
.popamm .pp-wrap{flex:1;min-height:0;display:grid;justify-items:center;align-items:start;padding:40px 18px}
.popamm .pp-stack{display:flex;flex-direction:column;align-items:center}
.popamm .pp-hero{width:100%;margin:0 0 26px;padding:0 4px;text-align:center;font-size:clamp(15px,3.8vw,40px);font-weight:700;letter-spacing:-.03em;line-height:1.05;color:var(--pp-text)}
.popamm .pp-cardhead{padding:6px 6px 12px;display:flex;flex-direction:column;gap:12px}
.popamm .pp-cardhead .pp-odds{margin-top:0}
.popamm .pp-card{
  width:472px;max-width:100%;background:rgba(255,255,255,.92);
  border:1px solid var(--pp-line);border-radius:32px;padding:12px;
  box-shadow:var(--pp-shadow);backdrop-filter:blur(18px)
}
.popamm .pp-body{min-height:384px;display:flex;flex-direction:column}
.popamm .pp-tabs,.popamm .pp-switch{display:grid;gap:6px;background:var(--pp-soft);padding:5px;border-radius:20px}
.popamm .pp-tabs{grid-template-columns:repeat(2,1fr);margin-bottom:8px}
.popamm .pp-switch{grid-template-columns:1fr 1fr;margin:8px 0}
.popamm .pp-wrap button{font:inherit;cursor:pointer}
.popamm .pp-wrap button:disabled{cursor:not-allowed}
.popamm .pp-tab,.popamm .pp-pill{border:0;background:transparent;border-radius:16px;padding:9px 8px;font-size:14px;font-weight:700;color:var(--pp-muted)}
.popamm .pp-active{background:#fff;color:var(--pp-accent);box-shadow:0 8px 24px rgba(20,20,20,.08)}
.popamm .pp-pill.pp-active-yes{color:var(--pp-yes)}
.popamm .pp-pill.pp-active-no{color:var(--pp-no)}
.popamm .pp-market{background:rgba(255,51,95,0.03);border:1px solid var(--pp-line);border-radius:24px;padding:15px;margin-bottom:8px}
.popamm .pp-row{display:flex;align-items:center;justify-content:space-between;gap:14px}
.popamm .pp-title{font-size:18px;font-weight:700;letter-spacing:-.02em;line-height:1.15}
.popamm .pp-lock{display:inline-flex;align-items:center;align-self:flex-start;gap:6px;font-size:12px;font-weight:700;color:#007AFF;background:rgba(0,122,255,0.06);border:1px solid rgba(0,122,255,0.18);border-radius:999px;padding:6px 10px;white-space:nowrap}
.popamm .pp-lock-countdown{background:transparent;border-color:transparent;padding:0}
.popamm .pp-lock-icon{font-size:14px;line-height:1}
.popamm .pp-odds{display:flex;gap:10px;margin-top:14px;align-items:center}
.popamm .pp-bar{height:9px;border-radius:999px;overflow:hidden;background:rgba(255,59,48,.12);width:100%}
.popamm .pp-yesbar{height:100%;background:var(--pp-yes)}
.popamm .pp-noText,.popamm .pp-yesText{font-size:13px;font-weight:700;white-space:nowrap}
.popamm .pp-yesText{color:var(--pp-yes)}.popamm .pp-noText{color:var(--pp-no)}
.popamm .pp-box{background:#fff;border:1px solid var(--pp-line);border-radius:24px;padding:12px 16px;margin-bottom:6px}
.popamm .pp-label{font-size:13px;font-weight:600;color:var(--pp-muted)}
.popamm .pp-meta{display:flex;justify-content:space-between;align-items:center;margin:12px 0;font-size:11px;font-weight:600;color:var(--pp-muted)}
.popamm .pp-amount{margin-top:1px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.popamm .pp-input{width:100%;border:0;background:transparent;outline:0;font-size:26px;font-weight:600;letter-spacing:-.03em;color:var(--pp-text)}
.popamm .pp-input:disabled{opacity:.5}
.popamm .pp-token{min-width: 85px; display:flex;justify-content:center;align-items:center;gap:7px;background:#fff;border:1px solid var(--pp-line);border-radius:999px;padding:9px 11px;font-size:15px;font-weight:700;white-space:nowrap}
.popamm .pp-coin{width:18px;height:18px;border-radius:50%;background:#2775ca url(/icons/usdc.svg) center/cover no-repeat}
.popamm .pp-yesCoin{background:var(--pp-yes)}.popamm .pp-noCoin{background:var(--pp-no)}.popamm .pp-lpCoin{background:#007AFF}
.popamm .pp-arrow{width:36px;height:36px;background:#fff;border:1px solid var(--pp-line);border-radius:14px;display:grid;place-items:center;margin:-1px auto 5px;color:var(--pp-muted);box-shadow:0 10px 25px rgba(20,20,20,.06)}
.popamm button.pp-arrow{transition:color .15s,transform .15s}
.popamm button.pp-arrow:hover{color:var(--pp-accent);transform:rotate(180deg)}
.popamm .pp-out{font-size:26px;font-weight:600;letter-spacing:-.03em;overflow:hidden;text-overflow:ellipsis}
.popamm .pp-cta{width:100%;border:0;border-radius:22px;padding:17px 16px;background:var(--pp-accent);color:white;font-size:16px;font-weight:700;letter-spacing:-.01em;transition:opacity .15s}
.popamm .pp-buy-cta{border-radius:16px;padding:9px 14px;font-size:13px}
.popamm .pp-cta:hover:not(:disabled){opacity:.9}
.popamm .pp-cta:disabled{opacity:.4}
.popamm .pp-note{border-radius:18px;padding:13px 15px;font-size:13px;font-weight:600;margin-bottom:6px}
.popamm .pp-note-muted{background:rgba(255,255,255,.8);border:1px solid var(--pp-line);color:var(--pp-muted)}
.popamm .pp-note-info{background:rgba(0,122,255,0.05);border:1px solid rgba(0,122,255,0.16);color:#007AFF}
.popamm .pp-note-warn{background:rgba(255,149,0,0.08);border:1px solid rgba(255,149,0,0.3);color:#FF9500}
.popamm .pp-note-ok{background:rgba(52,199,89,0.12);border:1px solid rgba(52,199,89,0.5);color:#34C759}
.popamm .pp-note-err{background:rgba(255,59,48,0.06);border:1px solid rgba(255,59,48,0.3);color:#FF3B30}
.popamm .pp-claimrow{background:#fff;border:1px solid var(--pp-line);border-radius:20px;padding:14px 16px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.popamm .pp-mini{border:0;border-radius:14px;padding:10px 16px;font-size:14px;font-weight:700;background:var(--pp-accent);color:#fff}
.popamm .pp-mini:disabled{opacity:.4}
.popamm .pp-faucetrow{padding:9px 12px}
.popamm .pp-faucet-title{font-size:11px;font-weight:800}
.popamm .pp-faucet-btn{border-radius:10px;padding:5px 10px;font-size:11px !important}
.popamm .pp-maxbtn{border:1px solid var(--pp-line);background:#fff;color:var(--pp-muted);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;margin-top:8px}
.popamm .pp-lp-maxbtn{padding:2px 7px;font-size:10px !important;margin-top:4px}
.popamm .pp-review{background:rgba(255,255,255,.5);border:1px solid var(--pp-line);border-radius:18px;padding:10px 14px;margin-bottom:6px;display:flex;flex-direction:column;gap:7px}
.popamm .pp-review-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:600}
.popamm .pp-review-row>span:first-child{color:var(--pp-muted);display:flex;align-items:center;gap:6px}
.popamm .pp-review-row>span:last-child{color:var(--pp-text)}
.popamm .pp-review-hint{font-size:11px;font-weight:600;color:var(--pp-muted);background:rgba(108,108,115,0.1);border-radius:999px;padding:2px 7px}
.popamm .pp-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;padding:13px 4px 4px}
.popamm .pp-foot a{font-size:13px;font-weight:700;color:var(--pp-accent);text-decoration:none}
.popamm .pp-position{background:rgba(0,122,255,0.05);border:1px solid rgba(0,122,255,0.18);border-radius:22px;padding:16px 18px;margin-bottom:8px}
.popamm .pp-position-label{font-size:12px;font-weight:700;color:#007AFF;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.popamm .pp-position-value{font-size:32px;font-weight:700;letter-spacing:-.03em;color:var(--pp-text);line-height:1}
.popamm .pp-position-unit{font-size:16px;font-weight:600;color:var(--pp-muted);margin-left:6px}
.popamm .pp-position-row{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
.popamm .pp-position-row>span{font-size:13px;font-weight:600;color:var(--pp-muted)}
.popamm .pp-hidden{display:none}
.popamm .pp-toast{position:fixed;right:20px;bottom:20px;z-index:1000;display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid var(--pp-line);border-radius:18px;padding:14px 16px;box-shadow:0 18px 50px rgba(20,20,20,.18);max-width:300px;animation:pp-toast-in .25s ease}
@keyframes pp-toast-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.popamm .pp-toast-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.popamm .pp-toast-title{font-size:14px;font-weight:700;color:#34C759;display:flex;align-items:center;gap:7px}
.popamm .pp-toast-err .pp-toast-title{color:#FF3B30}
.popamm .pp-toast-msg{font-size:12px;line-height:1.5;color:var(--pp-muted);word-break:break-word}
.popamm .pp-toast-x{border:0;background:transparent;color:var(--pp-muted);font-size:18px;line-height:1;cursor:pointer;padding:0}
.popamm .pp-toast-actions{display:flex;flex-direction:column;gap:8px}
.popamm .pp-toast-btn{flex:1;text-align:center;border:1px solid var(--pp-line);border-radius:12px;padding:9px 12px;font-size:13px;font-weight:700;color:var(--pp-accent);text-decoration:none;background:#fff;transition:background .15s}
.popamm .pp-toast-btn:hover{background:rgba(0,122,255,0.06)}
`
