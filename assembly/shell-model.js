'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MSOSAssemblyShellModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const VERSION='1.0.1';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const text=v=>String(v??'').trim();
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))?text(v):'';
  const month=v=>/^\d{4}-\d{2}$/.test(text(v))?text(v):'';
  const pad=n=>String(n).padStart(2,'0');
  function monthDays(monthValue){
    const m=month(monthValue);if(!m)throw new Error('Calendar model requires YYYY-MM month');const [y,mo]=m.split('-').map(Number),first=new Date(Date.UTC(y,mo-1,1)),lastDay=new Date(Date.UTC(y,mo,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7,cells=[];
    for(let i=0;i<offset;i++)cells.push(null);
    for(let d=1;d<=lastDay;d++)cells.push(`${m}-${pad(d)}`);
    while(cells.length%7)cells.push(null);
    return cells;
  }
  function addMonths(monthValue,delta){const [y,m]=month(monthValue).split('-').map(Number),d=new Date(Date.UTC(y,m-1+Number(delta||0),1));return`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`}
  function itemLabel(item){const squads=(item.squadEntries||[]).map(x=>x.squadLabel).filter(Boolean).join(' + '),clock=[item.start,item.end].filter(Boolean).join('–');return{text:squads||item.eventName||'Session',clock,venue:item.venue||'',course:item.course||'',state:item.sessionId?'ready':'scheduled'}}
  class ShellModel{
    constructor({schedule,navigation,today=()=>new Date().toISOString().slice(0,10)}={}){if(!schedule||typeof schedule.day!=='function')throw new Error('ShellModel requires Session Schedule surface');if(!navigation||typeof navigation.route!=='function')throw new Error('ShellModel requires Navigation State');this.schedule=schedule;this.navigation=navigation;this.today=today}
    route(){return this.navigation.route()}
    calendar(monthValue=''){
      const route=this.route(),m=month(monthValue)||route.month||this.today().slice(0,7),today=date(this.today()),cells=monthDays(m).map(d=>{if(!d)return null;const day=this.schedule.day(d),count=(day.items||[]).length;return{date:d,day:Number(d.slice(-2)),today:d===today,status:day.status||'unpublished',count,hasSessions:count>0,hasMeet:(day.items||[]).some(x=>x.kind==='event')}});return{type:'calendar',month:m,previousMonth:addMonths(m,-1),nextMonth:addMonths(m,1),weekdays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],cells}
    }
    day(dateValue=''){
      const d=date(dateValue)||this.route().date;if(!d)throw new Error('Day model requires exact date');const raw=this.schedule.day(d),items=(raw.items||[]).map(x=>({...clone(x),label:itemLabel(x)}));return{type:'day',date:d,status:raw.status,notes:clone(raw.notes||[]),source:clone(raw.source||null),items}
    }
    selectDate(d){this.navigation.openDate(d);this.navigation.markInteractive();return this.day(d)}
    changeMonth(m){this.navigation.openCalendar({month:m});this.navigation.markInteractive();return this.calendar(m)}
    openItem(id){
      const route=this.route();if(route.type!=='day')throw new Error('Session occurrence can only open from a selected Day view');const day=this.day(route.date),item=day.items.find(x=>x.id===text(id));if(!item)throw new Error(`Day item not found: ${id}`);
      if(item.type==='occurrence'&&item.sessionId){this.navigation.openBoard({date:route.date,occurrenceId:item.id,sessionId:item.sessionId});this.navigation.markInteractive();return{action:'board',route:this.route(),item:clone(item)}}
      return{action:'intake',route:this.route(),item:clone(item),candidateSlots:clone(item.slotIds||[item.id]),availableDaySlots:day.items.filter(x=>x.type==='slot').map(x=>({id:x.id,squadEntries:clone(x.squadEntries||[]),start:x.start,end:x.end,venue:x.venue,course:x.course,dayPart:x.dayPart,kind:x.kind}))}
    }
    back(){return this.navigation.back()}
    resume(){return this.navigation.resume()}
    view(){const route=this.route();if(route.type==='calendar')return this.calendar(route.month);if(route.type==='day')return this.day(route.date);return{type:route.type,route:clone(route)}}
  }
  const create=options=>new ShellModel(options);
  return{VERSION,create,ShellModel,monthDays,addMonths,itemLabel};
});
