'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=p=>fs.readFileSync(require.resolve('../'+p),'utf8');
const performance=read('engines/performance-ui.js');
const tabs=read('engines/swimmer-tabs-ui.js');
const loop=read('engines/coach-loop-ui.js');
const training=read('engines/swimmer-training-bd.js');

assert.doesNotMatch(performance,/IM-primary logic:/i,'Performance UI must show the resolved swimmer identity, not IM-selection reasoning');
assert.doesNotMatch(performance,/WA points|WA-equivalent/i,'Swimmer-facing performance UI uses WA, not WA points/WA-equivalent wording');
assert.doesNotMatch(performance,/\$\{esc\(x\.reason\)\}/,'Development opportunities must not expose engine reasoning text');
assert.match(performance,/Development opportunities/,'Performance UI keeps actionable development opportunities');
assert.match(performance,/\$\{Math\.floor\(bs\.points\)\} WA/,'Performance identity uses plain WA');

assert.doesNotMatch(tabs,/volume profile/i,'Swimmer Training tab must not expose volume-ratio reasoning');
assert.match(tabs,/trainingStatus\(ath\)/,'Swimmer Training tab must show the athlete prescription status');
assert.doesNotMatch(tabs,/WA points/i,'Swimmer Pathway copy uses WA terminology consistently');

assert.doesNotMatch(loop,/volume profile/i,'Today card must not expose volume-ratio reasoning');
assert.doesNotMatch(loop,/mod\.label/,'Today card must not display the internal modification profile label');
assert.match(loop,/individualTrainingStatus\(ath\)/,'Today card must display actual individual prescription/record status');

assert.doesNotMatch(training,/\$\{Math\.round\(r\.points\)\} pts/,'Training-performance links must label the score as WA');
assert.match(training,/\$\{Math\.round\(r\.points\)\} WA/,'Training-performance links use WA');

console.log('SWIMMER_DISPLAY_REGRESSION_PASS');
