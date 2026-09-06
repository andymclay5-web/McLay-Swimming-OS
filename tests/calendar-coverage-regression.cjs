'use strict';
// Real coaching failure this pins: the "Select session" calendar picker (app.js's M.calendar.C.slots,
// which drives the header's #sessionSelect dropdown and the date picker) reads monthly_calendar.json's
// `dates` array by exact date match (C.dateEntry). When a published calendar's `dates` array has a gap --
// even one inside its own advertised coverage_start/coverage_end window, or simply stops short of "today" --
// C.dateEntry(date) returns null and C.slots(date) returns [], so NO session pills render for that day at
// all (not even a disabled/"off" one). The coach (Andy) hit this live: the picker showed pills for
// Sep 1-5 2026, an "off" day for Sep 6, and then a completely blank picker for Sep 7 onward, because the
// published calendar's coverage_end was 2026-09-06 and no entries existed past it -- he could not open a
// session on a real training day (2026-09-07) because the calendar simply had no data for it.
//
// This test reproduces app.js's own C.dateEntry/C.slots logic (kept in exact sync with app.js, not a
// simplified stand-in) against the real, currently-published monthly_calendar.json, and asserts:
//   1. every date in [coverage_start, coverage_end] has an entry (no silent gaps within advertised coverage)
//   2. there are no duplicate date entries
//   3. every 'training'/'adjusted' day (one with sessions) resolves to at least one bookable slot
//   4. the specific date the coach was blocked on (2026-09-07) is covered and produces slots -- pinned as a
//      concrete regression marker for the reported incident, in addition to the general range check above
const assert=require('node:assert/strict');
const path=require('node:path');

const CALENDAR_PATH=path.join(__dirname,'..','monthly_calendar.json');
const data=require(CALENDAR_PATH);

// --- exact reimplementation of app.js's M.calendar.C.dateEntry / C.slots (see app.js, `M.calendar=C`) ---
function stableId(...parts){return parts.map(String).join('|')}
function dateEntry(cal,date){return cal?.dates?.find(x=>x.date===date)||null}
function slots(cal,date){
  const e=dateEntry(cal,date);if(!e)return[];
  const out=[];
  for(const s of (e.sessions||[])){
    for(const squad of s.squads||[])
      out.push({id:stableId('slot',date,s.day_part,s.start_time,s.end_time,squad,s.venue),date,dayPart:s.day_part,start:s.start_time,end:s.end_time,squad,venue:s.venue,course:s.pool_course||''});
  }
  for(const x of (e.events||[])){
    if(x.authorable&&x.session_squad)
      out.push({id:stableId('eventslot',date,x.name,x.start_time,x.venue),date,dayPart:Number(String(x.start_time).split(':')[0])<12?'AM':'PM',start:x.start_time,end:x.end_time,squad:x.session_squad,venue:x.venue,course:x.pool_course||'',eventName:x.name});
  }
  return out;
}

// 1 & 2. No gaps and no duplicates across the calendar's own advertised coverage window.
assert.ok(data.coverage_start&&data.coverage_end,'calendar must declare coverage_start/coverage_end');
const seen=new Set();
for(const e of data.dates){
  assert.ok(!seen.has(e.date),`duplicate date entry: ${e.date}`);
  seen.add(e.date);
}
const start=new Date(data.coverage_start+'T00:00:00Z'),end=new Date(data.coverage_end+'T00:00:00Z');
const missing=[];
for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){
  const iso=d.toISOString().slice(0,10);
  if(!seen.has(iso))missing.push(iso);
}
assert.deepEqual(missing,[],`monthly_calendar.json has gaps inside its own coverage window -- these dates render a completely blank "Select session" picker: ${missing.join(', ')}`);

// 3. Every day that actually has sessions published must resolve to at least one real, pickable slot --
//    guards against a session being listed with an empty squads[] array (silently producing zero slots).
for(const e of data.dates){
  if((e.sessions||[]).length){
    const s=slots(data,e.date);
    assert.ok(s.length>0,`${e.date} has published sessions but C.slots() resolves to zero pickable slots`);
  }
}

// 4. Pin the reported incident: 2026-09-07 (the date the coach was blocked on) must be covered and openable.
const reported=dateEntry(data,'2026-09-07');
assert.ok(reported,'2026-09-07 must have a calendar entry -- this is the exact date the coach reported "I can\'t open a session today" for');
assert.ok(slots(data,'2026-09-07').length>0,'2026-09-07 must resolve to at least one bookable session slot');

console.log('CALENDAR_COVERAGE_REGRESSION_PASS');
