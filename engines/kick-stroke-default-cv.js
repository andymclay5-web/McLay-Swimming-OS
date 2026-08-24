'use strict';
(function(g){
  const M=g.MSOS4,E=g.MSOSEngines;if(!M?.state||!E?.Coordinator)return;
  const X=M.kickStrokeDefaultCV={build:'v4-kick-number1-default-20260824cv'};
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const explicitStroke=raw=>/\b(?:free(?:style)?|fr|back(?:stroke)?|bk|breast(?:stroke)?|br|butterfly|fly|im|individual medley)\b/i.test(raw);
  const plainKick=item=>{const raw=text([item?.raw,item?.text,...(item?.cues||[])].filter(Boolean).join(' '));return /\bkick\b/i.test(raw)&&!explicitStroke(raw);};
  function markItem(item){if(!item||item.kind!=='set'||!plainKick(item))return false;if(item.kickStrokePolicy==='number1')return false;item.kickStrokePolicy='number1';item.authoredStrokeText=item.authoredStrokeText||text(item.raw||item.text);return true;}
  function markSession(s){let n=0;const walk=items=>{for(const i of items||[]){if(i?.kind==='group')walk(i.items);else if(markItem(i))n++;}};for(const b of s?.blocks||[])walk(b.items);return n;}
  function markAll(){let n=0;for(const s of Object.values(M.state?.canonicalSessions||{}))n+=markSession(s);return n;}
  function numberOneStroke(session,item,ath){
    const ov=E.Coordinator.overrideStroke?.(item,ath,M.state,session);if(ov)return E.Evidence?.stroke?.(ov)||ov;
    if(!plainKick(item)&&item?.kickStrokePolicy!=='number1')return'';
    try{const r=M.performanceEngine?.selectStrokeForContext?.(ath,{...item,raw:`${text(item.raw||item.text)} #1`},M.state,session,{formOnly:false});if(r?.stroke)return E.Evidence?.stroke?.(r.stroke)||r.stroke;}catch{}
    try{return E.RacePace?.resolveStroke?.({...item,raw:`${text(item.raw||item.text)} #1`},ath,M.state,session?.identity?.course||'SCM','')||'';}catch{return'';}
  }
  const base=E.Coordinator.prescription.bind(E.Coordinator);
  E.Coordinator.prescription=function(session,item,ath,state){
    markItem(item);const out=base(session,item,ath,state),actual=out?.item;if(!actual)return out;
    if(item?.kickStrokePolicy==='number1'&&plainKick(item)){
      const st=numberOneStroke(session,item,ath);if(st){out.item={...actual,stroke:st,kickStrokePolicy:'number1',strokeSelectionSource:'implicit #1 kick'};}
    }
    return out;
  };
  // Board's current #1 UI recognises the authored #1 token. Preserve the original line,
  // but add the semantic token only to the live canonical set so stroke pills appear.
  function primeBoard(){for(const s of Object.values(M.state?.canonicalSessions||{})){const walk=items=>{for(const i of items||[]){if(i?.kind==='group')walk(i.items);else if(i?.kind==='set'&&i.kickStrokePolicy==='number1'&&plainKick(i)&&!/#\s*1\b/i.test(text(i.raw||i.text))){i.authoredRaw=i.authoredRaw||i.raw;i.authoredText=i.authoredText||i.text;i.raw=`${text(i.raw||i.text)} · #1`;i.text=i.raw;}}};for(const b of s?.blocks||[])walk(b.items);}}
  const originalRender=M.ui?.renderBoard?.bind(M.ui);if(originalRender&&!X._wrapped){X._wrapped=true;M.ui.renderBoard=(...args)=>{markAll();primeBoard();return originalRender(...args);};if(M.boardEngine)M.boardEngine.render=M.ui.renderBoard;}
  markAll();
  X.plainKick=plainKick;X.markSession=markSession;X.numberOneStroke=numberOneStroke;
})(globalThis);
