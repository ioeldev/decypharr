const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function harness(asset, file='library-repair', klass='LibraryRepairManager') {
 const elements=new Map();const timers=[];
 const context=vm.createContext({window:{urlBase:'/base/'},document:{getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',showModal(){}});return elements.get(id);}},console,Date,AbortController,setTimeout(fn,delay){timers.push({fn,delay});return timers.length;},clearTimeout(){},confirm:()=>true});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../pkg/server/assets',asset,file+'.js'),'utf8'),context);
 const manager=vm.runInContext(`Object.create(${klass}.prototype)`,context);
 Object.assign(manager,{api:'/base/api',data:{incidents:[],jobs:[]},page:1,pageSize:25,filter:'all',query:'',expanded:new Set()});
 return {manager,context,elements,timers};
}
for(const asset of ['js','build/js']) {
 test(`${asset}: incidents track replacement IDs and distinguish import from readable`,()=>{
  const {manager}=harness(asset);
  const f={arr_name:'movies',arr_fingerprint:'a',arr_kind:'radarr',media_id:9,arr_file_id:43};
  const h={entry_name:'incident',status:'broken',last_failed_at:'2026-10-01',library_file:f};
  const j={id:'job',status:'ready',createdAt:'2026-10-02',bindings:[{arrName:'movies',arrInstanceFingerprint:'a',movieId:9,arrFileId:42}]};
  manager.data={incidents:[h],jobs:[j]};
  assert.equal(manager.rows().length,1);assert.equal(manager.rows()[0].category,'active');
  h.status='healthy';assert.equal(manager.rows()[0].category,'resolved');
  j.bindings[0].arrInstanceFingerprint='changed';assert.equal(manager.rows()[0].j,undefined);
 });
 test(`${asset}: table groups seasons, escapes titles, and keeps the configured URL base`,()=>{
  const {manager,elements}=harness(asset);
  const f={arr_name:'shows',arr_fingerprint:'a',arr_kind:'sonarr',media_id:9,season_number:1,episode_id:101,arr_file_id:42,source_path:'/TV/Example/Season 1/episode.mkv'};
  manager.data={incidents:[{entry_name:'incident',status:'broken',display_name:'<img onerror=evil()>',library_file:f}],jobs:[],maxRetries:3};
  manager.render();assert.match(elements.get('libraryRows').innerHTML,/aria-expanded="false"/);assert.equal(manager.visible.length,0);
  manager.expanded.add(JSON.stringify(['shows','a',9,1]));manager.render();
  const html=elements.get('libraryRows').innerHTML;
  assert.match(html,/&lt;img onerror=evil\(\)&gt;/);assert.doesNotMatch(html,/<img/);
  assert.match(html,/\/base\/api\/repair\/library\/media\?arr=shows&amp;media=9/);
  assert.equal(manager.visible.length,1);
 });
 test(`${asset}: legacy audits recover seasons without mixing seasons or inventing season zero`,()=>{
  const {manager,elements}=harness(asset);
  const base={arr_name:'shows',arr_fingerprint:'a',arr_kind:'sonarr',media_id:9};
  const incident=(id,path,extra={})=>({entry_name:`incident-${id}`,status:'broken',library_file:{...base,episode_id:id,arr_file_id:id,source_path:path,...extra}});
  const first=incident(11,'/TV/Example/Season 1/file.mkv');
  const second=incident(12,'/TV/Example/Season 2/file.mkv');
  const flat=incident(13,'/TV/Example/Example.S03E01.mkv');
  const unknown=incident(14,'/TV/Example/file.mkv');
  const special=incident(15,'/TV/Example/Specials/file.mkv');
  const bound=incident(16,'/TV/Example/file2.mkv');
  const binding={arrName:'shows',arrInstanceFingerprint:'a',arrType:'sonarr',seriesId:9,arrFileId:16,episodeIds:[16],seasonNumber:4};
  manager.data={incidents:[first,second,flat,unknown,special,bound],jobs:[{id:'job',status:'failed',bindings:[binding]}]};
  assert.deepEqual(Array.from(manager.rows(),r=>r.season),[1,2,3,null,0,4]);
  manager.render();
  const html=elements.get('libraryRows').innerHTML;
  for(const season of [0,1,2,3,4,'unknown'])assert.match(html,new RegExp(`Example · Season ${season} · 1 findings`));
  assert.match(elements.get('libraryPageInfo').textContent,/6 media\/season groups/);
  assert.equal(first.library_file.season_number,undefined);
  // Explicit zero is a real season; unrelated bindings must not supply a season.
  assert.equal(manager.seasonNumber({...bound.library_file,season_number:0},manager.data.jobs[0]),0);
  assert.equal(manager.seasonNumber(unknown.library_file,manager.data.jobs[0]),null);
  assert.equal(manager.seasonNumber({...unknown.library_file,source_path:'/TV/Example/episode-S00E02.mkv'},null),0);
  assert.equal(manager.seriesLabel({f:flat.library_file,label:'fallback'}),'Example');
 });
 test(`${asset}: a hanging response body is aborted and polling recovers`,async()=>{
  const {manager,context,elements,timers}=harness(asset);
  context.fetch=async(url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>{if(signal.aborted)reject(new Error('timeout'));else signal.addEventListener('abort',()=>reject(new Error('timeout')));})});
  const load=manager.load();await Promise.resolve();await Promise.resolve();
  assert.equal(timers[0].delay,10000);timers[0].fn();await load;
  assert.equal(manager.loading,false);assert.equal(timers.at(-1).delay,10000);
  assert.match(elements.get('libraryStatus').textContent,/retrying automatically/);
 });
 test(`${asset}: retry resumes a suspended incident and uses the queue endpoint`,async()=>{
  const {manager}=harness(asset);const calls=[];
  manager.visible=[{h:{entry_name:'incident',library_paused:true},j:{id:'job'},f:{}}];
  manager.request=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {};};manager.load=async()=>{};
  await manager.action({dataset:{row:'0',action:'retry'}});
  assert.equal(calls[0][1].action,'resume');assert.equal(calls[1][0],'/base/api/arr/reacquire/jobs/job/retry');
 });
 test(`${asset}: reacquisition view retries failed polling without erasing history`,async()=>{
  const {manager,timers}=harness(asset,'reacquire','ReacquireManager');
  manager.jobs=[{id:'existing',status:'needs_attention'}];manager.setStatusLine=()=>{};
  manager.fetchJSON=async()=>{throw new Error('offline');};
  await manager.loadJobs();assert.equal(manager.jobs[0].id,'existing');assert.equal(manager.loadingJobs,false);assert.equal(timers.at(-1).delay,15000);
 });
}
