const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function harness(asset){
 const elements=new Map();
 const element=()=>({innerHTML:'',textContent:'',value:'',querySelectorAll:()=>[],classList:{toggle(){}},showModal(){}});
 const context=vm.createContext({window:{},Date,console,document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement(){return {set textContent(v){this.innerHTML=escape(v);},innerHTML:''};}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../pkg/server/assets',asset,'reacquire.js'),'utf8'),context);
 const manager=vm.runInContext('Object.create(ReacquireManager.prototype)',context);
 Object.assign(manager,{api:'/base/api',jobs:[],jobsPage:1,jobsPageSize:10,selectedJobIds:new Set(),mediaLabels:new Map()});
 return {manager,elements};
}
const binding=(extra={})=>({arrName:'tv-sonarr',arrType:'sonarr',arrInstanceFingerprint:'same',seriesId:9,episodeIds:[29464],libraryPath:'/mnt/hardlinks/tv/Accused (US)/Season 1/Accused.US.S01E03.MULTi.mkv',...extra});
for(const asset of ['js','build/js']){
 test(`${asset}: existing job IDs become movie/series labels and Arr links`,()=>{
  const {manager,elements}=harness(asset);
  manager.loadVisibleMedia=()=>{};
  manager.jobs=[{id:'job',fileId:'15374',arrName:'tv-sonarr',arrType:'sonarr',status:'failed',bindings:[binding()]}];
  manager.renderJobs();
  const html=elements.get('jobsTableBody').innerHTML;
  assert.match(html,/Accused \(US\) · S01E03/);
  assert.doesNotMatch(html,/15374|29464/);
  assert.match(html,/\/base\/api\/repair\/library\/media\?arr=tv-sonarr&amp;media=9/);
  assert.match(html,/rel="noopener noreferrer"/);
  manager.showJob('job');assert.match(elements.get('jobDetailBody').innerHTML,/Accused \(US\) · S01E03/);
  assert.equal(manager.bindingMedia(binding({arrType:'radarr',movieId:4,libraryPath:'/movies/A Movie (2020)/release.mkv'})).label,'A Movie (2020)');
 });
 test(`${asset}: authoritative anime numbering, specials, multi-episode and safe fallback`,()=>{
  const {manager}=harness(asset);
  const b=binding({libraryPath:'/tv/Dragon Ball Kai/DBZ - 134.mkv',episodeIds:[900,901]});
  manager.mediaLabels.set(manager.mediaKey(b),{data:{title:'Dragon Ball Kai',episodes:[{id:901,seasonNumber:2,episodeNumber:4},{id:900,seasonNumber:2,episodeNumber:3}]}});
  assert.equal(manager.bindingMedia(b).label,'Dragon Ball Kai · S02E03, S02E04');
  manager.mediaLabels.clear();
  for(const [file,want] of [['Show.S01.E03.mkv','S01E03'],['Show.2x10.mkv','S02E10'],['Show.S00E01E02.mkv','S00E01E02'],['Show.S01E01-E03.mkv','S01E01-E03']]){
   assert.equal(manager.bindingMedia(binding({libraryPath:`/tv/Show/${file}`})).label,`Show · ${want}`);
  }
  assert.equal(manager.bindingMedia(binding({libraryPath:'/tv/Show/unusual.mkv',seasonNumber:2})).label,'Show · Season 2 · episode unavailable');
  assert.equal(manager.bindingMedia({}).label,'Media unavailable');
  const html=manager.mediaHTML(binding({libraryPath:'/tv/<img onerror=evil()>/Season 1/show.S01E01.mkv',arrName:'evil"&name'}));
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/arr=evil%22%26name/);
 });
 test(`${asset}: queue summary distinguishes search workers and shows Arr cooldowns`,async()=>{
  const {manager,elements}=harness(asset);
  manager.fetchJSON=async()=>({queued:40,in_flight:12,max_active:20,searching:3,search_workers:3,status_counts:{ready:9},interval:'5s',batch_size:50,batch_pause:'2m',search_cooldowns:{'tv-sonarr':'2026-10-18T20:00:00Z'}});
  await manager.loadRepairQueue();
  const text=elements.get('repairQueueSummary').textContent;
  assert.match(text,/12\/20 active slots, 3\/3 search workers/);
  assert.match(text,/Search rate limit: tv-sonarr until/);
 });
 test(`${asset}: metadata loads separately, deduplicates media, limits concurrency and caches failures`,async()=>{
  const {manager}=harness(asset);const calls=[];const pending=[];
  manager.jobs=[9,9,10,11].map(id=>({bindings:[binding({seriesId:id})]}));
  manager.fetchJSON=url=>{calls.push(url);return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
  manager.renderJobs=()=>manager.loadVisibleMedia(manager.jobs);
  manager.loadVisibleMedia(manager.jobs);
  assert.equal(calls.length,2);assert.equal(manager.mediaLoading.size,2);
  pending[0].resolve({title:'Title',episodes:[]});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,3);assert.equal(manager.mediaLoading.size,2);
  pending[1].reject(new Error('Arr unavailable'));pending[2].resolve({title:'Other',episodes:[]});
  await new Promise(resolve=>setImmediate(resolve));
  manager.loadVisibleMedia(manager.jobs);assert.equal(calls.length,3);assert.equal(manager.mediaLoading.size,0);
  assert.equal(manager.bindingMedia(binding()).title,'Title');
  assert.equal(manager.bindingMedia(binding({seriesId:10})).title,'Accused (US)');
 });
}
