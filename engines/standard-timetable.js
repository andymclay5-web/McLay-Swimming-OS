'use strict';
// Standard pool timetable (6 Oct 2026). Andy, with a screenshot of an empty October in the session
// calendar: "The base schedule hasn't changed, but should remain default unless modified like the season
// plans and weekly plans."
//
// Root cause: the only schedule source is monthly_calendar.json, a dated list that ended 4 Oct
// (coverage_end) with rules.empty_date_means_no_training -- so every date after it had no published
// sessions: an empty calendar grid and an Add session picker with "No published session".
//
// Fix: a standing weekly timetable, M.state.standardTimetable ({day:'Monday', sessions:[{day_part,
// start_time,end_time,squads,venue}]}), that fills every date the published calendar does not cover.
// The published calendar still wins for every date it covers (including its OFF days and meet-adjusted
// days) -- this only fills dates after its coverage. It stays as-is until the coach edits it (Data &
// References -> Standard pool timetable), exactly like the standard weekly plan template.
//
// Seeded once, from the published calendar itself: for each weekday, the most recent ordinary
// "training" day (not "adjusted"/"meet"/"off", and not the two days before a meet) -- i.e. the last
// normal week before the season ended, not a guessed pattern.
(function(g){
  const M=g.MSOS4;if(!M?.state||!M?.util)return;
  const T=M.standardTimetable={build:'v4-standard-timetable-20261006'};
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const clone=v=>JSON.parse(JSON.stringify(v));
  const dayName=iso=>{const t=Date.parse(`${iso}T12:00:00Z`);return Number.isFinite(t)?DAYS[new Date(t).getUTCDay()]:'';};
  const addDays=(iso,n)=>new Date(Date.parse(`${iso}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
  const cleanSession=s=>({day_part:String(s?.day_part||'').toUpperCase()==='PM'?'PM':'AM',start_time:String(s?.start_time||''),end_time:String(s?.end_time||''),squads:(s?.squads||[]).map(x=>String(x||'').trim()).filter(Boolean),venue:String(s?.venue||'').trim(),...(s?.pool_course?{pool_course:s.pool_course}:{})});

  function deriveFromCalendar(cal){
    const dates=[...(cal?.dates||[])].filter(d=>d?.date).sort((a,b)=>a.date.localeCompare(b.date));
    const hasEvent=new Set(dates.filter(d=>(d.events||[]).length||d.status==='meet').map(d=>d.date));
    const nearMeet=iso=>hasEvent.has(addDays(iso,1))||hasEvent.has(addDays(iso,2));
    const out=DAYS.map(day=>({day,sessions:[]}));
    for(const d of [...dates].reverse()){
      if(d.status!=='training'||!(d.sessions||[]).length||(d.events||[]).length||nearMeet(d.date))continue;
      const slot=out.find(x=>x.day===dayName(d.date));if(slot&&!slot.sessions.length)slot.sessions=(d.sessions||[]).map(cleanSession);
    }
    return out;
  }
  function ordered(rows){return DAYS.slice(1).concat('Sunday').map(day=>rows.find(r=>r.day===day)||{day,sessions:[]});}
  function get(){return Array.isArray(M.state.standardTimetable)&&M.state.standardTimetable.length?ordered(M.state.standardTimetable):null;}
  function seedIfMissing(cal){if(get())return false;const rows=deriveFromCalendar(cal);if(!rows.some(r=>r.sessions.length))return false;M.state.standardTimetable=ordered(rows);M.state.standardTimetableMeta={source:`Last ordinary week of ${cal?.title||'the published calendar'}`,seededAt:new Date().toISOString()};try{M.store?.save?.(M.state)}catch{}return true;}
  function set(rows,meta={}){M.state.standardTimetable=ordered((rows||[]).map(r=>({day:r.day,sessions:(r.sessions||[]).map(cleanSession).filter(s=>s.squads.length)})));M.state.standardTimetableMeta={...(M.state.standardTimetableMeta||{}),...meta,editedAt:new Date().toISOString()};try{M.store?.save?.(M.state)}catch{}T.reset();}

  // One extended view of the calendar: published dates as-is, then the standard timetable for every date
  // after the published coverage, out to a year from today. Cached per published calendar + timetable.
  let cache={key:'',value:null};
  function extend(cal){
    const base=cal&&Array.isArray(cal.dates)?cal:{dates:[]};
    seedIfMissing(base);const rows=get();
    const pubEnd=base.coverage_end||[...base.dates].map(d=>d.date).sort().at(-1)||'';
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Pacific/Auckland'});
    const key=JSON.stringify([base.calendar_id||'',pubEnd,base.dates.length,rows,today]);
    if(cache.key===key)return cache.value;
    if(!rows){cache={key,value:base};return base;}
    const have=new Set(base.dates.map(d=>d.date)),extra=[];
    const start=pubEnd?addDays(pubEnd,1):today,stop=addDays(today>start?today:start,365);
    for(let d=start;d<=stop;d=addDays(d,1)){if(have.has(d))continue;const r=rows.find(x=>x.day===dayName(d));const sessions=clone(r?.sessions||[]);extra.push({date:d,status:sessions.length?'training':'off',sessions,events:[],notes:[sessions.length?'Standard timetable':'OFF — standard timetable'],source:'standard_timetable'});}
    const value={...base,dates:[...base.dates,...extra],published_coverage_end:pubEnd,coverage_end:extra.length?extra.at(-1).date:pubEnd,standard_timetable_from:extra[0]?.date||''};
    cache={key,value};return value;
  }
  T.reset=()=>{cache={key:'',value:null};M.calendar?.reset?.();};
  T.DAYS=DAYS;T.deriveFromCalendar=deriveFromCalendar;T.get=get;T.set=set;T.seedIfMissing=seedIfMissing;T.extend=extend;
  T.isStandard=entry=>entry?.source==='standard_timetable';

  // The calendar owner (app.js M.calendar.load) asks extend() for its view; nothing here wraps it.
  g.addEventListener?.('msos:data-updated',()=>T.reset());
})(globalThis);
