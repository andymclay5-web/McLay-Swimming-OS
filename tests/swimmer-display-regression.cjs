'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(require.resolve('../'+p),'utf8');
const performance=read('engines/performance-ui.js');
const deck=read('engines/swimmer-tabs-ui.js');
const instant=read('engines/swimmer-instant-open-cn.js');
const pathwayUi=read('engines/performance-pathway-ui-ck.js');
const loop=read('engines/coach-loop-ui.js');
const training=read('engines/swimmer-training-bd.js');

assert.doesNotMatch(performance,/IM-primary logic:/i,'Performance UI must not expose engine-jargon labels');
assert.match(performance,/selectionContext\(profile\)/,'Performance UI keeps useful plain-language selection context');
assert.match(performance,/Today ·/,'Performance UI explains contextual stroke choice in swimmer language');
assert.doesNotMatch(performance,/WA points|WA-equivalent/i,'Swimmer-facing performance UI uses compact score-system labels');
assert.match(performance,/WPS/,'Performance UI distinguishes World Para scoring');

assert.match(deck,/v4-swimmer-deck-only-20260824cp/,'legacy swimmer tabs must stay retired');
assert.doesNotMatch(deck,/data-msos-ath-panel/,'deck helper must not render a second swimmer page');
assert.match(instant,/data-cn-tab="performance"/,'single-owner swimmer surface exposes Performance');
assert.match(instant,/data-cn-tab="training"/,'single-owner swimmer surface exposes Training');
assert.match(instant,/data-cn-tab="tests"/,'single-owner swimmer surface exposes Tests');
assert.match(instant,/data-cn-tab="meet"/,'single-owner swimmer surface exposes Meet');
assert.doesNotMatch(instant,/data-cn-tab="pathway"/,'Pathway must not be a separate scrolling tab');
assert.match(instant,/Tap to load pathway, PB race and splits/,'event detail must stay collapsed until tapped');
assert.match(instant,/function trainingHtml\(a\)/,'Training tab must show the athlete-specific training view');
assert.match(pathwayUi,/disabled:true/,'legacy standalone pathway renderer must remain retired');

assert.doesNotMatch(loop,/volume profile/i,'Today card must not expose volume-ratio reasoning');
assert.doesNotMatch(loop,/mod\.label/,'Today card must not display the internal modification profile label');
assert.match(loop,/individualTrainingStatus\(ath\)/,'Today card must display actual individual prescription/record status');

assert.match(training,/scoreSystem=ath/,'Training-performance links derive the correct score system for the swimmer');
assert.match(training,/\$\{Math\.round\(r\.points\)\} \$\{system\}/,'Training-performance links can render WA or WPS instead of hardcoding WA');

console.log('SWIMMER_DISPLAY_REGRESSION_PASS');
