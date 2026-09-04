'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require.resolve('../engines/attendance-roster.js'),'utf8');
const appSrc=fs.readFileSync(require.resolve('../app.js'),'utf8');
assert.match(src,/LEAD SESSION ROSTER/,'lead-session Roll wording missing');
assert.match(src,/data-roll-add-squad/,'Add squad control missing');
assert.match(src,/data-roll-add-ath/,'Add individual control missing');
assert.match(src,/id=\"rosterSearch\"/,'type-to-search swimmer input missing');
assert.match(src,/slice\(0,8\)/,'swimmer search should stay compact');
// The Roll must delegate the identity edit to the canonical-session owner —
// it must not clone + putSession the whole session itself (WRITER_MAP §1).
assert.match(src,/M\.changes\.addSessionSquad\(session,squad\)/,'squad add must go through the canonical-session owner');
assert.doesNotMatch(src,/M\.store\??\.?\.putSession/,'Roll must not write the canonical session directly');
assert.match(appSrc,/C\.addSessionSquad=/,'canonical-session owner is missing addSessionSquad');
assert.match(appSrc,/tx\(next,'add_session_squad'/,'squad add is not journalled as an explicit session identity change');
assert.match(src,/setAttendance\(s,b\.dataset\.rosterAth,'present'\)/,'individual add should mark the swimmer Here');
assert.match(src,/\|\|explicit\.has\(a\.id\)/,'cross-squad individual attendance is not included in the session roster');
console.log('ATTENDANCE_ROSTER_STATIC_PASS');
