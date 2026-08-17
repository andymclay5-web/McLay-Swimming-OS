'use strict';
const E=require('../engines/session-truth.js');
const id={id:'debug',date:'2026-08-18',dayPart:'AM',squads:['National','Development'],venue:'AquaGym',course:'SCM'};

const spoken='Warm-up, 400 free, 4 50s kick, 10 seconds rest, 200 IM. Pre-set, six times 50 build, four freestyle, two number one on 60, and then 200 IM. Main set, five times 400, one regeneration, one development, one overload, one threshold, one clearance, all based on a T400. Sharpness, 8 times 25 on 40. Warm-down, 200 easy.';
const a=E.parse(spoken,id);
console.log('--- SPOKEN DEBUG ---');
console.log('TOTAL',E.totalDistance(a));
console.log('NORMALIZED\n'+a.metadata.normalizedSource);
console.log(JSON.stringify(a.blocks.map(b=>({type:b.type,title:b.title,authoredTitle:b.authoredTitle,distance:E.blockDistance(b),items:b.items})),null,2));

const src=`Warm Up
3 x 200
1 Free
1 Back
1 Breast
15s Rest

Pre Set
6 x 50
25 #1 Drill
25 #1 Swim @ 1:00
8 x 25 #1 Kick @ 0:45
12.5 Max
12.5 Easy

Main Set
800 Freestyle Regeneration
30s Rest
2 x 400 Freestyle Development
30s Rest
4 x 200 Freestyle Overload
30s Rest
12 x 100 with Fins
4 Rounds:
25 Max / 75 Easy
75 Easy / 25 Underwater
25 Max / 50 Easy / 25 Max
800 Pull
Hypoxic 3 / 5 / 7

Warm Down
200 Easy

TOTAL 5700m`;
const b=E.parse(src,id);
console.log('--- 5700 DEBUG ---');
console.log('TOTAL',E.totalDistance(b),'WRITTEN',b.metadata.writtenTotal);
console.log(JSON.stringify(b.blocks.map(x=>({type:x.type,distance:E.blockDistance(x),items:x.items})),null,2));
