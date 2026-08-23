'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(require.resolve('../'+p),'utf8');
const performance=read('engines/performance-ui.js');
const tabs=read('engines/swimmer-tabs-ui.js');
const loop=read('engines/coach-loop-ui.js');
const training=read('engines/swimmer-training-bd.js');

assert.doesNotMatch(performance,/IM-primary logic:/i,'Performance UI must not expose engine-jargon labels');
assert.match(performance,/selectionContext\(profile\)/,'Performance UI keeps useful plain-language selection context');
assert.match(performance,/Today ·/,'Performance UI explains contextual stroke choice in swimmer language');
assert.doesNotMatch(performance,/WA points|WA-equivalent/i,'Swimmer-facing performance UI uses compact score-system labels');
assert.match(performance,/WPS/,'Performance UI distinguishes World Para scoring');
assert.match(performance,/Current evidence:/,'Development opportunities show the evidence behind a suggested event');
assert.match(performance,/What this race tells us:/,'Development opportunities explain why the suggested race is useful');
assert.doesNotMatch(performance,/\$\{esc\(x\.reason\)\}/,'Development UI must not dump internal reason strings');
assert.match(performance,/estimate only/,'Modeled target times are clearly labelled as estimates');

assert.doesNotMatch(tabs,/volume profile/i,'Swimmer Training tab must not expose volume-ratio reasoning');
assert.match(tabs,/trainingStatus\(ath\)/,'Swimmer Training tab must show the athlete prescription status');
assert.doesNotMatch(tabs,/WA points/i,'Swimmer Pathway copy avoids old WA-points wording');

assert.doesNotMatch(loop,/volume profile/i,'Today card must not expose volume-ratio reasoning');
assert.doesNotMatch(loop,/mod\.label/,'Today card must not display the internal modification profile label');
assert.match(loop,/individualTrainingStatus\(ath\)/,'Today card must display actual individual prescription/record status');

assert.match(training,/scoreSystem=ath/,'Training-performance links derive the correct score system for the swimmer');
assert.match(training,/\$\{Math\.round\(r\.points\)\} \$\{system\}/,'Training-performance links can render WA or WPS instead of hardcoding WA');

console.log('SWIMMER_DISPLAY_REGRESSION_PASS');
