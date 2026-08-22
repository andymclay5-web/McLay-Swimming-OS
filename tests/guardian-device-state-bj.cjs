'use strict';
const assert=require('node:assert/strict');

function placeholderName(name){return /^swimmer\s+[a-z0-9]+$/i.test(String(name||'').replace(/\s+/g,' ').trim())}
function deviceStateChecks(state){
  const athletes=Array.isArray(state?.athletes)?state.athletes:[];
  const placeholders=athletes.filter(a=>placeholderName(a?.full_name||a?.name));
  return {
    ok: placeholders.length===0,
    placeholders: placeholders.map(a=>({id:a.id||'',name:a.full_name||a.name||''}))
  };
}

assert.equal(deviceStateChecks({athletes:[{id:'charlotte',full_name:'Charlotte Murphy'}]}).ok,true);
const contaminated=deviceStateChecks({athletes:[{id:'a',full_name:'Swimmer A'},{id:'b',full_name:'Swimmer B'},{id:'charlotte',full_name:'Charlotte Murphy'}]});
assert.equal(contaminated.ok,false,'Guardian must fail a roster containing placeholder test swimmers');
assert.deepEqual(contaminated.placeholders.map(x=>x.name),['Swimmer A','Swimmer B']);
console.log('PASS Guardian device-state rule · placeholder test swimmers are a hard failure');
