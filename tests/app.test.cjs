const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

class Element {
  constructor() { this.children = []; this.dataset = {}; this.listeners = {}; this.value = ''; this.checked = false; this.style = {}; this._html = ''; this._text = ''; this.className = ''; this.disabled = false;
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' '); }, remove: (...names) => { this.className = this.className.split(' ').filter(n => !names.includes(n)).join(' '); }, toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name) };
  }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(value) { this._text = value; this.children = []; }
  get textContent() { return this._text; }
  appendChild(child) { this.children.push(child); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name) { for (const handler of this.listeners[name] || []) handler({ target: this }); }
  querySelectorAll(selector) {
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return all;
    if (selector.startsWith('input[type=checkbox]')) return all.filter(el => el.type === 'checkbox' && (!selector.includes(':checked') || el.checked));
    if (selector === '.ball') return all.filter(el => el.className.split(' ').includes('ball'));
    return [];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function harness() {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const historyModes = ['exclude', 'include'].map((value, i) => Object.assign(new Element(), { value, checked: i === 0 }));
  const jobs = new Map(); let nextId = 0;
  const ctx = vm.createContext({ console, AbortController, Date, Math: Object.create(Math), setTimeout: (fn, delay) => { const id = ++nextId; jobs.set(id, { fn, delay }); return id; }, clearTimeout: id => jobs.delete(id), setInterval: () => { throw new Error('No background sync in tests'); }, fetch: () => { throw new Error('Unexpected network request'); }, document: { getElementById: node, querySelector: () => node('repeatStatus'), querySelectorAll: () => historyModes, createElement: () => new Element() } });
  // Load actual event wiring, excluding only startup rendering/network/auto-sync.
  vm.runInContext(source.slice(0, source.lastIndexOf('\nrenderNumberBoard();')), ctx, { filename: 'app.js' });
  const run = code => vm.runInContext(code, ctx);
  run(`globalThis.base = { sumMin:null,sumMax:null,oddCount:null,evenCount:null,smallCount:null,bigCount:null,maxConsecutive:6,maxTail:null,rowLimit:[],rowLimitSet:null,colorCounts:{red:null,blue:null,green:null},elementCounts:{metal:null,wood:null,water:null,fire:null,earth:null} };`);
  return { ctx, node, run, async flush(delay) { const selected = [...jobs].filter(([, job]) => job.delay === delay); for (const [id, job] of selected) { jobs.delete(id); await job.fn(); } }, jobs };
}
const draw = (date = '2026-01-03', numbers = [1,2,3,4,5,6], special = 7) => ({ year:2026, no:Number(date.slice(8,10)) || 1, status:'Result', drawDate:date, numbers, special });
function setDraws(h, draws, variable = 'state.analysisDraws') { h.run(`${variable} = ${JSON.stringify(draws)}`); }
function raw(d) { return { ...d, drawResult: { drawnNo:d.numbers, xDrawnNo:d.special } }; }

test('count is order invariant for sum pruning and does not mutate the pool', async () => {
  const h = harness();
  assert.equal(await h.run('countCombinations([49,1,2,3,4,5,6], {...base,sumMax:21}, [], 0)'), 1);
  assert.equal(await h.run('countCombinations([1,2,3,4,5,6,49], {...base,sumMax:21}, [], 0)'), 1);
  assert.equal(h.run('const p=[6,5,4,3,2,1]; normalizePool(p); p.join(",")'), '6,5,4,3,2,1');
});
test('reverse selection cannot bypass maximum consecutive run', async () => {
  const h = harness();
  assert.equal(await h.run('countCombinations([6,5,4,3,2,1], {...base,maxConsecutive:2}, [], 0)'), 0);
  assert.equal(h.run('isValid([6,5,4,3,2,1], {...base,maxConsecutive:2})'), false);
  assert.equal(h.run('isValid([1,2,4,5,7,8], {...base,maxConsecutive:2})'), true);
});
test('small-pool exact counts agree with independent enumeration across filters and bankers', async () => {
  const h = harness(); let seed = 538;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 40; trial++) {
    const pool = [...Array(49)].map((_, i) => i + 1).sort(() => random() - 0.5).slice(0,10);
    const required = trial % 3 === 0 ? pool.slice(0,2) : [];
    const odd = trial % 2 ? null : Math.floor(random()*7);
    const min = 50 + Math.floor(random()*100), max = min + 55;
    const limit = 1 + Math.floor(random()*3), tailLimit = 1 + Math.floor(random()*3);
    let expected = 0;
    const visit = (start, picked) => {
      if (picked.length === 6) {
        const sorted = [...picked].sort((a,b)=>a-b), sum = picked.reduce((a,b)=>a+b,0);
        let run=1, longest=1; for(let i=1;i<6;i++) { run=sorted[i]===sorted[i-1]+1?run+1:1; longest=Math.max(longest,run); }
        const tails=Array(10).fill(0); for(const n of picked) tails[n%10]++;
        if(sum>=min && sum<=max && (odd===null || picked.filter(n=>n%2).length===odd) && longest<=limit && Math.max(...tails)<=tailLimit && required.every(n=>picked.includes(n))) expected++;
        return;
      }
      for(let i=start;i<pool.length;i++) visit(i+1,[...picked,pool[i]]);
    }; visit(0,[]);
    const actual = await h.run(`countCombinations(${JSON.stringify(pool)}, {...base,sumMin:${min},sumMax:${max},oddCount:${odd},maxConsecutive:${limit},maxTail:${tailLimit}}, ${JSON.stringify(required)}, 0)`);
    assert.equal(actual, expected, `trial ${trial}`);
  }
});
function generationHarness() {
  const h = harness(); h.node('ticketCount').value = '10';
  h.run('readFilters=()=>base; getFilteredPool=()=>[1,2,3,4,5,6,7,8,9,10]; updateSumRangeUI=updateAvailableCount=updateConsecutiveList=renderCategoryLists=()=>{}; countCombinations=async()=>1;');
  return h;
}
test('invalid new constraints clear prior cards; cached failure keeps its message', async () => {
  const h = generationHarness(); h.run('autoUpdate()'); await h.flush(250);
  assert.equal(h.node('resultList').children.length,10);
  h.run('readFilters=()=>({...base,evenCount:6}); autoUpdate()'); await h.flush(250);
  assert.equal(h.node('resultList').children.length,0);
  const message = h.node('generateStatus').textContent;
  assert.match(message,/雙數/);
  h.run('autoUpdate()'); await h.flush(250);
  assert.equal(h.node('generateStatus').textContent,message);
});
test('quantity changes regenerate while mathematical count key stays unchanged', async () => {
  const h = generationHarness(); h.run('autoUpdate()'); await h.flush(250);
  const key = h.run('buildFilterKey(base,[1,2,3,4,5,6])');
  h.node('ticketCount').value = '100'; h.node('ticketCount').emit('change'); await h.flush(250);
  assert.equal(h.node('resultList').children.length,100);
  assert.equal(h.run('buildFilterKey(base,[1,2,3,4,5,6])'),key);
});
test('explicit Generate rerolls even with unchanged settings', async () => {
  const h = generationHarness(); h.run('globalThis.generations=0; const realGenerate=generateSets; generateSets=(...args)=>{generations++;return realGenerate(...args)}; autoUpdate()'); await h.flush(250);
  h.node('generateBtn').emit('click'); await h.flush(250);
  assert.equal(h.run('generations'),2);
});
test('partial sampling warnings survive rendering', async () => {
  const h = generationHarness();
  h.run('generateSets=()=>{setGenerateStatus("抽樣次數已達上限");return [[1,2,3,4,5,6]]};autoUpdate()'); await h.flush(250);
  assert.equal(h.node('resultList').children.length,1);
  assert.match(h.node('generateStatus').textContent,/抽樣/);
});
test('automatic bankers use exactly the visible one-period history and recalculate', () => {
  const h = harness(); h.node('lastN').value='1';
  const visible=draw('2026-01-03',[25,26,27,28,29,30],31);
  setDraws(h,[raw(visible)],'state.draws'); setDraws(h,[draw('1993-01-05')]);
  h.run('state.historyMode="include";globalThis.updates=0;autoUpdate=()=>{updates++};pickDanNumbers()');
  const bankers=Array.from(h.run('[...state.included]'));
  assert.equal(bankers.length,2); assert.ok(bankers.every(n=>[...visible.numbers,visible.special].includes(n)));
  assert.equal(h.run('updates'),1);
});
test('zero/incomplete history does not invent a two-period banker window', () => {
  const h=harness();setDraws(h,[raw(draw())],'state.draws');
  h.node('lastN').value='0';h.run('pickDanNumbers()');assert.equal(h.run('state.included.size'),0);assert.match(h.node('danStatus').textContent,/至少 1/);
  h.node('lastN').value='2';h.run('pickDanNumbers()');assert.equal(h.run('state.included.size'),0);assert.match(h.node('danStatus').textContent,/未載入完整/);
});
test('out-of-order history responses cannot overwrite the latest selection', async () => {
  const h=harness();let first,second;
  h.ctx.responses=[new Promise(r=>{first=r}),new Promise(r=>{second=r})];
  h.run('requestDraws=()=>responses.shift();fetchLatestInfo=()=>{};');
  const a=h.run('fetchDraws(2)'),b=h.run('fetchDraws(1)');
  second([raw(draw('2026-01-03'))]);await b;first([raw(draw('2026-01-01'))]);await a;
  assert.equal(h.run('state.draws[0].drawDate'),'2026-01-03');assert.equal(h.node('pickDan').disabled,false);
});
test('failed history request removes stale selections and disables auto-pick', async () => {
  const h=harness();setDraws(h,[raw(draw())],'state.draws');
  h.run('state.included.add(1);requestDraws=async()=>{throw new Error("offline")};');
  await h.run('fetchDraws(1)');assert.equal(h.run('state.draws.length'),0);assert.equal(h.run('state.included.size'),0);assert.equal(h.node('pickDan').disabled,true);assert.match(h.node('fetchStatus').textContent,/已清除/);
});
test('empty/invalid local data falls back to validated snapshot', async () => {
  for(const local of [{draws:[]},{draws:[draw('bad date')]}]) {
    const h=harness();const calls=[];
    h.ctx.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url.startsWith('http:')?local:{updatedAt:null,draws:[draw()]}}};
    await h.run('fetchAnalysisData()');assert.equal(h.run('state.analysisSource'),'snapshot');assert.equal(calls.length,2);
    h.run('renderAnalysisMetadata(new Date("2026-10-14T00:00:00Z"))');
    assert.match(h.node('analysisMeta').textContent,/截至 2026-01-03/);assert.match(h.node('analysisMeta').textContent,/未記錄/);assert.match(h.node('analysisMeta').textContent,/請核對/);
  }
});
test('local request timestamp never masquerades as acquisition time', async () => {
  const h=harness();h.ctx.fetch=async()=>({ok:true,json:async()=>({updatedAt:'2026-10-14',servedAt:'2026-10-14',draws:[draw()]})});
  await h.run('fetchAnalysisData()');assert.equal(h.run('state.analysisSource'),'local');assert.match(h.node('analysisMeta').textContent,/本地 CSV/);assert.match(h.node('analysisMeta').textContent,/取數時間未記錄/);
});
test('unavailable historical sources clear old statistics and expose failure', async () => {
  const h=harness();setDraws(h,[draw()]);h.ctx.fetch=async()=>{throw new Error('offline')};
  await h.run('fetchAnalysisData()');assert.equal(h.run('state.analysisDraws.length'),0);assert.match(h.node('analysisStatus').textContent,/失敗/);assert.match(h.node('analysisMeta').textContent,/暫無/);
});
test('payload validation rejects duplicate draws, malformed dates and duplicate balls', () => {
  const h=harness();for(const rows of [[draw(),draw()],[draw(),{...draw("2026-01-04"),no:3}],[draw(),{...draw(),no:2}],[{...draw(),year:0}],[draw('invalid')],[draw('2026-02-30')],[draw('2026-01-03',[1,1,2,3,4,5])]]) {
    assert.throws(()=>h.run(`readAnalysisPayload(${JSON.stringify({draws:rows})})`));
  }
});
test('repeat rates count special-to-main overlaps in chronological order', () => {
  const h=harness();const a=draw('2026-01-01'),b=draw('2026-01-02',[7,8,9,10,11,12],13);
  setDraws(h,[b,a]);const result=h.run('computeRepeatRates(state.analysisDraws,1)[0]');
  assert.equal(result.total,1);assert.equal(result.atLeast1,1);assert.equal(result.atLeast2,0);assert.equal(result.avgOverlap,1);
});
test('snapshot is unchanged from the reviewed Git blob and passes basic integrity checks', () => {
  const bytes=fs.readFileSync(path.join(root,'data/marksix.json'));
  assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),'32ac613fa9de5ec74573636341d66156124222a2');
  const data=JSON.parse(bytes);const h=harness();h.ctx.payload=data;assert.equal(h.run('readAnalysisPayload(payload).length'),4289);
  assert.equal(data.draws.at(-1).drawDate,'2026-01-03+08:00');
});
test('mobile source keeps sync actions visible and offers table overflow', () => {
  const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  assert.doesNotMatch(css,/\.analysis-actions\s*\{[^}]*display:\s*none/s);
  assert.match(css,/\.repeat-table\s*\{[^}]*overflow-x:\s*auto/s);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(html,/id="analysisMeta"[^>]*role="status"/);assert.match(html,/最多連續幾個號碼/);
});

test('history adapter normalizes numeric API strings before exclusion and banker selection', async () => {
  const h=harness();const fixture={...raw(draw()),year:'2026',no:'3',drawResult:{drawnNo:['1','2','3','4','5','6'],xDrawnNo:'7'}};
  h.ctx.fixture=fixture;h.run('requestDraws=async()=>[fixture];fetchLatestInfo=()=>{};');
  await h.run('fetchDraws(1)');assert.equal(h.run('state.excluded.has(1)'),true);assert.equal(h.run('getVisibleHistoryDraws(1).length'),1);
});

function countGroup(h, name) {
  const group=h.node(name);
  for(let count=0;count<=6;count++) {const input=new Element();input.type='checkbox';input.dataset.count=String(count);group.appendChild(input);}
  return group;
}
test('big/small stay complementary on edits in both directions and clear together', () => {
  const h=harness();countGroup(h,'smallCount');countGroup(h,'bigCount');
  h.run('setSelectedCount(els.smallCount,3);updateCountConstraints("small")');
  assert.equal(h.run('[getSelectedCount(els.smallCount),getSelectedCount(els.bigCount)].join(",")'),'3,3');
  h.run('setSelectedCount(els.smallCount,2);updateCountConstraints("small")');
  assert.equal(h.run('[getSelectedCount(els.smallCount),getSelectedCount(els.bigCount)].join(",")'),'2,4');
  assert.ok(h.node('bigCount').children.every(input=>!input.disabled));
  h.run('setSelectedCount(els.bigCount,1);updateCountConstraints("big")');
  assert.equal(h.run('[getSelectedCount(els.smallCount),getSelectedCount(els.bigCount)].join(",")'),'5,1');
  h.run('setSelectedCount(els.bigCount,null);updateCountConstraints("big")');
  assert.equal(h.run('getSelectedCount(els.smallCount)'),null);assert.equal(h.run('getSelectedCount(els.bigCount)'),null);
});
test('clearing odd/even clears both sides consistently', () => {
  const h=harness();countGroup(h,'oddCount');countGroup(h,'evenCount');
  h.run('setSelectedCount(els.oddCount,2);updateCountConstraints("odd");setSelectedCount(els.evenCount,null);updateCountConstraints("even")');
  assert.equal(h.run('getSelectedCount(els.oddCount)'),null);assert.equal(h.run('getSelectedCount(els.evenCount)'),null);
});
test('conflicting category totals and parity sum bounds are explained before sampling', () => {
  const h=harness();
  for(const expression of ['{...base,smallCount:2,bigCount:3}','{...base,colorCounts:{red:1,blue:1,green:1}}','{...base,elementCounts:{metal:1,wood:1,water:1,fire:1,earth:1}}']) {
    assert.match(h.run(`checkFeasibility(${expression},Array.from({length:49},(_,i)=>i+1)).message`),/矛盾/);
  }
  const result=h.run('checkFeasibility({...base,evenCount:6,sumMax:21},Array.from({length:49},(_,i)=>i+1))');
  assert.equal(result.ok,false);assert.match(result.message,/至少 42/);
  h.run('pickRandomSet=()=>{throw new Error("must not sample")};generateSets(Array.from({length:49},(_,i)=>i+1),{...base,evenCount:6,sumMax:21})');
  assert.match(h.node('generateStatus').textContent,/至少 42/);assert.equal(h.run('state.generationReport.available'),0);
});
test('banker parity, tail and consecutive conflicts have specific explanations', () => {
  const h=harness();h.run('state.included=new Set([1,3,5,7]);');
  assert.match(h.run('checkFeasibility({...base,oddCount:3},Array.from({length:49},(_,i)=>i+1)).message'),/膽號超出單數/);
  h.run('state.included=new Set([1,11]);');
  assert.match(h.run('checkFeasibility({...base,maxTail:1},Array.from({length:49},(_,i)=>i+1)).message'),/同尾/);
  h.run('state.included=new Set([3,1,2]);');
  assert.match(h.run('checkFeasibility({...base,maxConsecutive:2},Array.from({length:49},(_,i)=>i+1)).message'),/連號/);
});
test('one valid set produces one card and seven candidates produce all seven unique sets', () => {
  const h=harness();h.node('ticketCount').value='10';h.run('buildExcluded=()=>{};');
  assert.equal(h.run('generateSets([1,2,3,4,5,6],base).length'),1);assert.match(h.node('generateStatus').textContent,/只有 1/);
  const sets=h.run('generateSets([1,2,3,4,5,6,7],base)');
  assert.equal(sets.length,7);assert.equal(new Set(Array.from(sets,nums=>Array.from(nums).join(','))).size,7);
  assert.equal(h.run('state.generationReport.available'),7);assert.match(h.node('generationSummary').textContent,/要求 10.*實際 7.*有效組合 7/);
});
test('two bankers and seven drags preserve all-bankers semantics and have 35 unique combinations', async () => {
  const h=harness();h.node('ticketCount').value='100';
  h.run('buildExcluded=()=>{};state.historyMode="include";state.included=new Set([1,2]);state.dragged=new Set([9,8,7,6,5,4,3]);');
  assert.equal(await h.run('countCombinations([9,1,8,2,7,3,6,4,5],base,[1,2],0)'),35);
  const sets=h.run('generateSets([1,2,3,4,5,6,7,8,9],base)');assert.equal(sets.length,35);
  assert.ok(Array.from(sets).every(nums=>nums.includes(1)&&nums.includes(2)&&nums.length===6));
  assert.equal(new Set(Array.from(sets,nums=>Array.from(nums).join(','))).size,35);
});
test('large-pool sampling is unique and exhaustion is never proof of no solution', () => {
  const h=harness();h.run('buildExcluded=()=>{};Math.random=()=>0;');
  const result=h.run('generateSets(Array.from({length:49},(_,i)=>i+1),base)');
  assert.equal(result.length,1);assert.equal(h.run('state.generationReport.available'),null);
  assert.match(h.node('generateStatus').textContent,/未抽足唔代表條件無解/);
  h.run('applyCombinationCount(13983816,base,Array.from({length:49},(_,i)=>i+1),state.generationReport.countKey)');
  assert.equal(h.run('state.generationReport.available'),13983816);assert.match(h.node('generateStatus').textContent,/抽樣達上限/);
});
test('active conditions show effective restrictions and explain empty/no-drag behavior', () => {
  const h=harness();h.node('lastN').value='1';
  h.run('state.historyMode="include";state.included=new Set([1,2]);renderActiveConditions({...base,oddCount:3,evenCount:3,sumMin:90,sumMax:210,maxTail:2,maxConsecutive:2,rowLimit:[1,3]},[1,2,3,4,5,6])');
  const text=h.node('activeConditions').textContent;
  for(const re of [/全部 2 個膽/,/未選拖碼/,/唔會自動強制包含歷史/,/單數恰好 3/,/總和 90–210/,/01–10、21–30/]) assert.match(text,re);
  h.run('state.dragged=new Set([3,4,5,6,7,8,9]);renderActiveConditions(base,[1,2,3,4,5,6,7,8,9])');
  assert.match(h.node('activeConditions').textContent,/其餘 4 個從所選 7 拖/);
});
test('drag pool target is part of count/generation state so cached results cannot survive a new conflict', async () => {
  const h=generationHarness();h.run('state.historyMode="include";autoUpdate()');await h.flush(250);
  assert.equal(h.node('resultList').children.length,10);
  h.node('dragCount').value='7';h.node('dragCount').emit('change');await h.flush(250);
  assert.equal(h.node('resultList').children.length,0);assert.match(h.node('generateStatus').textContent,/拖碼數量/);
});
test('exact zero-count updates explain combined failure without claiming one arbitrary cause', () => {
  const h=harness();h.run('state.generationReport={countKey:"test",requested:10,produced:0,available:null};applyCombinationCount(0,base,[1,2,3,4,5,6],"test")');
  assert.match(h.node('generateStatus').textContent,/完整計算/);assert.match(h.node('generateStatus').textContent,/所有條件合併/);
  assert.match(h.node('generationSummary').textContent,/有效組合 0/);
});
