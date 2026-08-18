'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.MSOSEngines=root.MSOSEngines||{};root.MSOSEngines.EvidencePublication=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.0';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  function mark(row,domain){const verified=row?.evidence_status==='verified';return{...clone(row),evidence_domain:domain,truth_scope:'operational',permanent_eligible:verified,publication_status:verified?'verified_publishable':'operational_only'}}
  class EvidencePublication{
    constructor({testResults=null,meetResults=null}={}){
      if(testResults&&(!(typeof testResults.query==='function')||!(typeof testResults.evidenceRows==='function')))throw new Error('Evidence Publication testResults contract requires query and evidenceRows');
      if(meetResults&&(!(typeof meetResults.query==='function')||!(typeof meetResults.evidenceRows==='function')))throw new Error('Evidence Publication meetResults contract requires query and evidenceRows');
      this.testResults=testResults;this.meetResults=meetResults;
    }
    operationalTests(query={}){return this.testResults?clone(this.testResults.query(query)).map(x=>mark(x,'training_test')):[]}
    operationalMeetResults(query={}){return this.meetResults?clone(this.meetResults.query(query)).map(x=>mark(x,'meet_result')):[]}
    provisional({athleteRef='',meetId='',testKey=''}={}){const tests=this.operationalTests({athleteRef,testKey}).filter(x=>!x.permanent_eligible),meet=this.operationalMeetResults({athleteRef,meetId}).filter(x=>!x.permanent_eligible);return{version:VERSION,tests,meet_results:meet,count:tests.length+meet.length}}
    verifiedSource({id='engine-verified-evidence',priority=250,trust='verified'}={}){
      const tests=this.testResults?this.testResults.evidenceRows({verifiedOnly:true}):[],meet=this.meetResults?this.meetResults.evidenceRows({verifiedOnly:true}):[];
      return{id:text(id)||'engine-verified-evidence',priority:Number(priority)||0,trust:text(trust)||'verified',data:{training_test_results:clone(tests),coach_results:clone(meet)},publication:{version:VERSION,verified_only:true,training_tests:tests.length,meet_results:meet.length}};
    }
    status(){const operationalTests=this.operationalTests({}),operationalMeet=this.operationalMeetResults({}),source=this.verifiedSource();return{version:VERSION,operational:{training_tests:operationalTests.length,meet_results:operationalMeet.length,provisional:operationalTests.concat(operationalMeet).filter(x=>!x.permanent_eligible).length},published:{training_tests:source.publication.training_tests,meet_results:source.publication.meet_results}}}
  }
  const create=options=>new EvidencePublication(options);
  return{VERSION,create,EvidencePublication,mark};
});
