const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createWorkspace}=require('../ui.js');
class Element {
  constructor(doc,id='') {this.doc=doc;this.id=id;this.attrs={};this.dataset={};this.listeners={};this.children=[];this.hidden=false;this.textContent='';this.tabIndex=0;this.value='';this.height=92;this.open=false;this.isConnected=true;this.classes=new Set();this.classList={contains:n=>this.classes.has(n),toggle:(n,on)=>on?this.classes.add(n):this.classes.delete(n)};}
  setAttribute(name,value){this.attrs[name]=value;}
  getAttribute(name){return this.attrs[name]??null;}
  removeAttribute(name){delete this.attrs[name];}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(f=>f!==fn);}
  emit(name,extras={}){const event={target:this,key:'',preventDefault(){this.prevented=true},...extras};for(const fn of this.listeners[name]||[])fn(event);return event;}
  click(){this.emit('click');}
  focus(){this.doc.activeElement=this;this.doc.emit?.("focusin",{target:this});}
  scrollIntoView(){this.scrolled=true;}
  getBoundingClientRect(){return {height:this.hidden?0:this.height};}
  closest(){return this.area||null;}
  querySelectorAll(selector){if(selector==='.ball[data-number]')return this.children.filter(n=>n.dataset.number);if(selector==='input:checked')return this.children.filter(n=>n.checked);if(selector==='select')return this.children.filter(n=>n.tag==='select');return [];}
  querySelector(selector){const m=selector.match(/data-number="(\d+)"/);return m?this.children.find(n=>n.dataset.number===m[1])||null:null;}
}
function setup(){
 const nodes=new Map(),doc={};doc.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Element(doc,id));return nodes.get(id)};
 const node=doc.getElementById;doc.body=node('body');doc.activeElement=doc.body;doc.documentElement={style:{values:{},setProperty(k,v){this.values[k]=v}}};
 const targets=['choose','filters','results'].map(id=>{const n=new Element(doc);n.dataset.viewTarget=id;return n});
 const mode={value:'exclude'};doc.querySelector=s=>s==='.active-summary'?node('active-summary'):s.includes('historyMode')?mode:null;doc.querySelectorAll=()=>targets;
 doc.events={};doc.addEventListener=(k,fn)=>(doc.events[k]??=[]).push(fn);doc.removeEventListener=(k,fn)=>doc.events[k]=doc.events[k].filter(f=>f!==fn);doc.emit=(k,e)=>{for(const fn of doc.events[k]||[])fn(e)};
 const observers=[],resizers=[];class Observer{constructor(fn){this.fn=fn;this.sources=[];observers.push(this)}observe(source){this.sources.push(source)}disconnect(){this.disconnected=true}}
 class Resizer{constructor(fn){this.fn=fn;resizers.push(this)}observe(){}disconnect(){this.disconnected=true}}
 const win=new Element(doc);win.MutationObserver=Observer;win.ResizeObserver=Resizer;
 node('comboCount').textContent='可組合：35';node('constraintStatus').textContent='單項及基本交互檢查通過；最終以精確組合數為準。';
 const appState={bankers:[1,2],drag:[3,4,5,6,7,8,9],sum:[90,210],results:[[1,2,3,4,5,6]]};
 node('generateBtn').addEventListener('click',()=>{appState.clicks=(appState.clicks||0)+1});
 const controller=createWorkspace(doc,win);return {node,doc,win,mode,appState,controller,observers,resizers,targets};
}
test('tabs allow direct visits and return to last workflow view without changing app state',()=>{
 const h=setup(),before=JSON.stringify(h.appState);assert.equal(h.controller.currentView,'choose');
 for(const id of ['results','filters','choose','filters'])h.controller.activateView(id);
 h.node('historyTab').click();assert.equal(h.node('historyView').hidden,false);assert.equal(h.node('mobileActions').hidden,true);
 h.node('returnToWorkflow').click();assert.equal(h.controller.currentView,'filters');assert.equal(h.doc.activeElement,h.node('filtersView'));assert.equal(JSON.stringify(h.appState),before);
 assert.equal(h.controller.activateView('unknown'),false);
});
test('roving tabs support arrows, Home/End and exactly one selected accessible panel',()=>{
 const h=setup();let e=h.node('chooseTab').emit('keydown',{key:'ArrowLeft'});assert.equal(e.prevented,true);assert.equal(h.controller.currentView,'history');assert.equal(h.doc.activeElement,h.node('historyTab'));
 h.node('historyTab').emit('keydown',{key:'Home'});assert.equal(h.controller.currentView,'choose');
 h.node('chooseTab').emit('keydown',{key:'End'});assert.equal(h.controller.currentView,'history');
 const ids=['choose','filters','results','history'];assert.equal(ids.filter(id=>h.node(id+'Tab').getAttribute('aria-selected')==='true').length,1);assert.equal(ids.filter(id=>!h.node(id+'View').hidden).length,1);
});
test('mobile action invokes the real existing generation button and focuses results',()=>{
 const h=setup();h.node('mobileGenerate').click();assert.equal(h.appState.clicks,1);assert.equal(h.controller.currentView,'results');assert.equal(h.doc.activeElement,h.node('resultsView'));
 h.node('comboCount').textContent='可組合：0';h.observers[0].fn();assert.equal(h.node('workflowCount').textContent,'可組合：0');assert.equal(h.node('mobileComboCount').textContent,'可組合：0');
});
test('measured mobile bar reserve follows actual wrapped height and clears on history',()=>{
 const h=setup();h.node('mobileActions').height=212;h.resizers[0].fn();assert.equal(h.doc.documentElement.style.values['--mobile-action-height'],'212px');
 h.controller.activateView('history');assert.equal(h.doc.documentElement.style.values['--mobile-action-height'],'0px');h.controller.activateView('choose');assert.equal(h.doc.documentElement.style.values['--mobile-action-height'],'212px');
});
test('advanced settings remain selected while collapsed and their summary exposes active controls',()=>{
 const h=setup(),a=new Element(h.doc);a.checked=true;const b=new Element(h.doc);b.tag='select';b.value='2';h.node('advancedFilters').children=[a,b];h.node('advancedFilters').open=false;
 h.controller.sync();assert.match(h.node('advancedSummary').textContent,/已選 2 項/);h.controller.activateView('history');h.controller.activateView('filters');assert.equal(a.checked,true);assert.equal(b.value,'2');assert.equal(h.node('advancedFilters').open,false);
});
test('new conflicts open the retained condition summary and partial-generation warnings remain visible',()=>{
 const h=setup();h.node('constraintStatus').textContent='總和至少 42，超出上限 21。';h.controller.sync();assert.equal(h.node('active-summary').open,true);assert.match(h.node('workflowFeedback').textContent,/至少 42/);
 h.node('active-summary').open=false;h.controller.sync();assert.equal(h.node('active-summary').open,false);
 h.node('constraintStatus').textContent='單項及基本交互檢查通過';h.node('generateStatus').textContent='抽樣達上限，未抽足唔代表無解';h.controller.sync();assert.match(h.node('workflowFeedback').textContent,/未抽足/);
});
test('compact data summary preserves source, cutoff, unknown acquisition and stale notice',()=>{
 const h=setup();h.node('analysisMeta').textContent='資料：隨附歷史快照｜截至 2026-01-03｜取數時間未記錄｜最後一期距今 284 日，請核對有冇更新；未即時核對官方最新結果。';h.controller.sync();
 assert.match(h.node('dataSummary').textContent,/隨附歷史快照.*2026-01-03.*未記錄.*核對/);
 h.node('analysisMeta').textContent='未能載入本地 CSV 或隨附快照，暫無歷史分析。';h.controller.sync();assert.match(h.node('dataSummary').textContent,/未能載入/);
});
test('selectable number spans gain keyboard semantics without replacing native app click handlers',()=>{
 const h=setup(),ball=new Element(h.doc);ball.dataset.number='3';ball.area=h.node('numberBoard');ball.addEventListener('click',()=>{ball.calls=(ball.calls||0)+1});h.node('numberBoard').children=[ball];h.mode.value='include';h.controller.sync();
 assert.equal(ball.getAttribute('role'),'button');assert.equal(ball.tabIndex,0);const e={key:' ',target:ball,preventDefault(){this.prevented=true}};h.doc.emit('keydown',e);assert.equal(e.prevented,true);assert.equal(ball.calls,1);
 ball.classes.add('included');h.controller.sync();assert.equal(ball.getAttribute('aria-disabled'),'true');h.doc.emit('keydown',e);assert.equal(ball.calls,1);
 h.mode.value='exclude';h.controller.sync();assert.equal(ball.getAttribute('role'),null);assert.equal(ball.tabIndex,-1);
});
test('recreated historical balls retain focus only when no other control took it',()=>{
 const h=setup();h.mode.value='include';const old=new Element(h.doc);old.dataset.number='7';old.area=h.node('excludedSummary');h.doc.emit('focusin',{target:old});old.isConnected=false;
 const replacement=new Element(h.doc);replacement.dataset.number='7';replacement.area=h.node('excludedSummary');h.node('excludedSummary').children=[replacement];h.controller.sync();assert.equal(h.doc.activeElement,replacement);
 replacement.isConnected=false;h.doc.activeElement=h.doc.body;const next=new Element(h.doc);next.dataset.number='7';next.area=h.node('excludedSummary');h.node('excludedSummary').children=[next];h.controller.sync();assert.equal(h.doc.activeElement,next);
 h.doc.emit('focusin',{target:old});h.doc.activeElement=h.node('chooseTab');h.controller.sync();assert.equal(h.doc.activeElement,h.node('chooseTab'));
});
test('destroy disconnects observers and removes navigation handlers',()=>{const h=setup();h.controller.destroy();h.node('historyTab').click();assert.equal(h.controller.currentView,'choose');assert.ok(h.observers.every(o=>o.disconnected));assert.ok(h.resizers.every(o=>o.disconnected));});
