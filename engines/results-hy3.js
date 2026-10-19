'use strict';
// Meet results files (19 Oct 2026). Andy: "is there any way we can get results straight from online? ... TM files that are
// available through Swimming New Zealand website ... automate retrieval of that and keep it up to date" -> "build the
// automated way and scrape for historical data of current swimmers ... as well as have ability to load manually or later
// integrate with swimify and meet mobile".
//
// Owner of one thing: turning a published meet results file into plain result rows. It does not decide who a swimmer is
// in MSOS, whether a time is a PB or whether it is saved -- the results sync (supabase/functions/msos-results-sync)
// matches swimmers and stages rows for the coach to approve; the PB board reads only approved rows.
//
// Reads Hy-Tek Meet Manager "Results for Team Manager" files (.hy3, usually inside a .zip -- what SwimInfo NZ posts as
// "TM Results File"). Column positions follow the open-source hytek-parser (github.com/SwimComm/hytek-parser, MIT).
// Individual swims only: relay legs are skipped (a relay split is not a swimmer's individual result).
// The same file runs in the app, in node tests and in the Deno edge function (it has no dependencies).
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.MSOS4=root.MSOS4||{};root.MSOS4.resultsFile=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='hy3-1.0-20261019';
  const col=(line,start,len)=>String(line||'').slice(start-1,start-1+len).trim();
  const STROKE={A:'Freestyle',1:'Freestyle',B:'Backstroke',2:'Backstroke',C:'Breaststroke',3:'Breaststroke',D:'Butterfly',4:'Butterfly',E:'IM',5:'IM'};
  const COURSE={S:'SCM',M:'SCM',1:'SCM',L:'LCM',3:'LCM',Y:'SCY',2:'SCY'};
  const ROUND={P:'Heat',F:'Final',S:'Swim-off'};
  // time codes beside the time: Q/F/D = disqualified/false start/did not finish; R/S = no show/scratch
  const STATUS={'':'OK',' ':'OK',U:'OK',Q:'DQ',F:'DQ',D:'DNF',R:'DNS',S:'DNS'};
  function mdy(v){const s=String(v||'').trim();if(!/^\d{8}$/.test(s))return null;const m=+s.slice(0,2),d=+s.slice(2,4),y=+s.slice(4);if(!(m>=1&&m<=12&&d>=1&&d<=31&&y>1900))return null;return`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  // NZ para swimmers carry their classes in the name field ("Murphy S6/Sb6/Sm6", sometimes cut short: "Newlove S19/Sb19/Sm1").
  function paraName(v){const m=String(v||'').match(/^(.*?)\s+(S\d{1,2})(?:\s*\/\s*(SB\d{1,2})?)?(?:\s*\/\s*(SM\d{0,2})?)?\s*$/i);if(!m||!m[1].trim())return{name:String(v||'').trim()};
    const cut=String(v).length>=20,sm=m[4]&&/\d/.test(m[4])&&!cut?m[4].toUpperCase():null;return{name:m[1].trim(),classes:{s:m[2].toUpperCase(),sb:m[3]?m[3].toUpperCase():null,sm}};}
  function num(v){const n=Number(String(v||'').trim());return Number.isFinite(n)?n:null;}
  function clock(sec){if(!(sec>0))return'';const m=Math.floor(sec/60),s=sec-m*60;const ss=s.toFixed(2).padStart(m?5:4,'0');return m?`${m}:${ss}`:ss;}
  function parse(text){
    const lines=String(text||'').replace(/\r/g,'').split('\n').map(l=>l.replace(/\s+$/,''));
    if(!lines.length||lines[0].slice(0,2)!=='A1')throw new Error('Not a Hy-Tek results file (.hy3)');
    const out={version:VERSION,meet:{name:'',facility:'',start:null,end:null,course:'',software:col(lines[0],44,15)},teams:[],swimmers:{},results:[],warnings:[]};
    let team=null,entry=null;
    for(const line of lines){const code=line.slice(0,2);
      try{
        if(code==='B1'){out.meet.name=col(line,3,45);out.meet.facility=col(line,48,45);out.meet.start=mdy(col(line,93,8));out.meet.end=mdy(col(line,101,8));}
        else if(code==='B2'){out.meet.course=COURSE[col(line,99,1)]||out.meet.course;}
        else if(code==='C1'){team={code:col(line,3,5),name:col(line,8,30),short:col(line,38,16)};out.teams.push(team);}
        else if(code==='D1'){const id=col(line,4,5),first=paraName(col(line,29,20)),last=paraName(col(line,9,20)),pref=paraName(col(line,49,20));out.swimmers[id]={key:id,sex:col(line,3,1),last:last.name,first:first.name,preferred:pref.name,classes:last.classes||first.classes||pref.classes||null,regId:col(line,70,14),dob:mdy(col(line,89,8)),age:num(col(line,97,3)),teamCode:team?.code||'',teamName:team?.name||''};entry=null;}
        else if(code==='E1'){const sw=out.swimmers[col(line,4,5)];entry=sw?{swimmer:sw,distance:num(col(line,16,6)),stroke:STROKE[col(line,22,1)]||'',course:COURSE[col(line,51,1)]||'',event:col(line,39,4),swims:[]}:null;}
        else if(code==='F1'||code==='F2'||code==='F3'){entry=null;}
        else if(code==='E2'&&entry){const t=col(line,4,8),tn=num(t),codeChar=line.charAt(12),status=STATUS[codeChar]??'OK',course=COURSE[col(line,12,1)]||entry.course||out.meet.course;
          const swim={round:ROUND[col(line,3,1)]||'',timeSec:tn&&tn>0?tn:null,course,status:tn&&tn>0?status:(status==='OK'?'NT':status),heat:num(col(line,21,3)),lane:num(col(line,24,3)),place:num(col(line,30,4)),date:mdy(col(line,88,8)),splits:[]};
          entry.swims.push(swim);out.results.push({swimmer:entry.swimmer,distance:entry.distance,stroke:entry.stroke,event:entry.event,...swim,ref:swim});}
        else if(code==='G1'&&entry&&entry.swims.length){const last=entry.swims[entry.swims.length-1];let hi=last.splits.length?last.splits[last.splits.length-1].metres/25:-1;
          for(let p=2;p+11<=line.length&&p<=124;p+=11){const slot=line.slice(p,p+11);if(!slot.trim())break;let idx=num(slot.slice(1,3)),tm=num(slot.slice(3,11));if(idx===null||!(tm>0))continue;while(idx<=hi)idx+=100;hi=idx;last.splits.push({metres:idx*25,cumulative:tm});}}
      }catch(e){out.warnings.push(`${code}: ${e.message}`);}
    }
    out.swimmers=Object.values(out.swimmers);
    // splits are written after the result line; copy the final split list onto each flattened row
    for(const r of out.results){r.splits=r.ref.splits;delete r.ref;r.timeText=clock(r.timeSec);r.date=r.date||out.meet.start||out.meet.end;}
    return out;
  }
  // ---------- .zip (stored or deflated entries), using the platform's DecompressionStream ----------
  async function inflateRaw(bytes){const ds=new DecompressionStream('deflate-raw');const stream=new Blob([bytes]).stream().pipeThrough(ds);return new Uint8Array(await new Response(stream).arrayBuffer());}
  async function unzip(buf){const b=buf instanceof Uint8Array?buf:new Uint8Array(buf),dv=new DataView(b.buffer,b.byteOffset,b.byteLength),files=[];
    // end of central directory
    let eocd=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}}
    if(eocd<0)throw new Error('Not a zip file');
    let p=dv.getUint32(eocd+16,true);const count=dv.getUint16(eocd+10,true);
    for(let n=0;n<count;n++){if(dv.getUint32(p,true)!==0x02014b50)break;const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nlen=dv.getUint16(p+28,true),elen=dv.getUint16(p+30,true),clen=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
      const name=new TextDecoder().decode(b.subarray(p+46,p+46+nlen));p+=46+nlen+elen+clen;
      const lnlen=dv.getUint16(off+26,true),lelen=dv.getUint16(off+28,true),start=off+30+lnlen+lelen,data=b.subarray(start,start+csize);
      files.push({name,read:async()=>method===0?data:method===8?inflateRaw(data):Promise.reject(new Error(`Unsupported zip compression (${method})`))});}
    return files;}
  const latin1=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));return s;};
  // A results download: a .zip holding a .hy3, or a bare .hy3. Returns the parsed file.
  async function read(buf,name=''){const b=buf instanceof Uint8Array?buf:new Uint8Array(buf);
    if(b[0]===0x50&&b[1]===0x4b){const files=await unzip(b);const hy3=files.find(f=>/\.hy3$/i.test(f.name));if(!hy3){const kinds=files.map(f=>f.name.split('.').pop().toLowerCase());throw new Error(kinds.includes('hy3')?'Results file missing':`This zip has no results file (.hy3) — it holds ${[...new Set(kinds)].join(', ')||'nothing'}. Entry files (.hyv/.ev3) are not results.`);}
      const parsed=parse(latin1(await hy3.read()));parsed.fileName=hy3.name;return parsed;}
    const parsed=parse(latin1(b));parsed.fileName=name;return parsed;}
  // ---------- matching to MSOS swimmers (exact only; anything else stays unmatched for the coach) ----------
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z]+/g,' ').trim();
  const regNorm=s=>String(s||'').replace(/\D+/g,'').replace(/^0+/,'');
  function matcher(athletes){const byReg=new Map(),byNameDob=new Map(),byName=new Map(),byAlias=new Map();
    for(const a of athletes||[]){const r=regNorm(a.membership_number);if(r)byReg.set(r,a);const n=norm(a.full_name);if(!n)continue;if(a.date_of_birth)byNameDob.set(`${n}|${String(a.date_of_birth).slice(0,10)}`,a);(byName.get(n)||byName.set(n,[]).get(n)).push(a);
      // results-file identities the coach has confirmed for this swimmer (e.g. a different date of birth in meet files)
      for(const al of a.source_profile?.results_aliases||[]){const an=norm(al.name);if(an&&al.dob)byAlias.set(`${an}|${al.dob}`,a);}}
    return sw=>{const r=regNorm(sw.regId);if(r&&byReg.has(r))return{athlete:byReg.get(r),confidence:'snz_id'};
      const names=[...new Set([`${sw.first} ${sw.last}`,sw.preferred?`${sw.preferred} ${sw.last}`:''].filter(Boolean).map(norm))];
      for(const n of names)if(sw.dob&&byNameDob.has(`${n}|${sw.dob}`))return{athlete:byNameDob.get(`${n}|${sw.dob}`),confidence:'name_dob'};
      for(const n of names)if(sw.dob&&byAlias.has(`${n}|${sw.dob}`))return{athlete:byAlias.get(`${n}|${sw.dob}`),confidence:'coach_linked'};
      for(const n of names){const c=byName.get(n)||[];if(c.length===1&&!(c[0].date_of_birth&&sw.dob))return{athlete:c[0],confidence:'name_only'};}
      return null;};}
  // Same name as an MSOS swimmer but a different date of birth: not matched, offered to the coach as a possible match.
  function suggester(athletes){const byName=new Map();for(const a of athletes||[]){const n=norm(a.full_name);if(n)(byName.get(n)||byName.set(n,[]).get(n)).push(a);}
    return sw=>{for(const n of [norm(`${sw.first} ${sw.last}`),sw.preferred?norm(`${sw.preferred} ${sw.last}`):''].filter(Boolean)){const c=byName.get(n)||[];if(c.length===1)return{athlete_id:c[0].id,athlete_name:c[0].full_name,msos_dob:c[0].date_of_birth||null};}return null;};}
  return{VERSION,parse,unzip,read,matcher,suggester,clock,norm,paraName};
});
