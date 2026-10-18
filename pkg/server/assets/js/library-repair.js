// Dedicated incident view. All remote filesystem/Arr work is queued by actions;
// polling only reads persisted health and recovery snapshots.
class LibraryRepairManager {
    constructor() {
        this.api = `${window.urlBase}api`;
        this.data = {incidents: [], jobs: []};
        this.page = 1; this.pageSize = 25;
        this.filter = 'all'; this.query = ''; this.expanded = new Set();
        const $ = id => document.getElementById(id);
        this.initSort($('librarySort'));
        $('libraryRefresh').addEventListener('click', () => this.load());
        $('libraryFilter').addEventListener('change', e => {this.filter=e.target.value;this.page=1;this.render();});
        $('libraryQuery').addEventListener('input', e => {this.query=e.target.value.toLowerCase();this.page=1;this.render();});
        $('libraryPrev').addEventListener('click',()=>{this.page=Math.max(1,this.page-1);this.render();});
        $('libraryNext').addEventListener('click',()=>{this.page++;this.render();});
        $('libraryRows').addEventListener('click',e=>{const group=e.target.closest('button[data-group]');if(group){const key=group.dataset.group;if(this.expanded.has(key))this.expanded.delete(key);else this.expanded.add(key);this.render();return;}const b=e.target.closest('button[data-action]');if(b)this.action(b);});
        this.load();
    }
    sortKey() {return `decypharr.libraryRepair.sort:${window.urlBase||'/'}`;}
    validSort(value) {return ['changed','checked','name','retry'].includes(value)?value:'changed';}
    initSort(select) {
        let saved;
        try {saved=window.localStorage?.getItem(this.sortKey());} catch(_) {}
        this.sort=this.validSort(saved);
        select.value=this.sort;
        select.addEventListener('change',()=>{
            this.sort=this.validSort(select.value);this.page=1;
            try {window.localStorage?.setItem(this.sortKey(),this.sort);} catch(_) {}
            this.render();
        });
    }
    timestamp(value) {
        const n=Date.parse(value);
        return Number.isFinite(n)&&n>0?n:0;
    }
    changedAt(row) {
        const h=row.h,j=row.j;
        // Observation polling updates updatedAt even when the status is unchanged.
        return Math.max(this.timestamp(h?.status_changed_at)||Math.max(this.timestamp(h?.last_failed_at),this.timestamp(h?.last_ok_at)),
            this.timestamp(j?.phaseStartedAt)||this.timestamp(j?.completedAt)||this.timestamp(j?.startedAt)||this.timestamp(j?.createdAt));
    }
    sortValue(row) {
        if(this.sort==='checked')return this.timestamp(row.h?.last_checked_at);
        if(this.sort==='retry')return row.j?.status==='retry_scheduled'?this.timestamp(row.j.retryAt):0;
        return this.changedAt(row);
    }
    compareNames(a,b) {
        const name=row=>this.seriesLabel(row);
        const compare=(x,y)=>String(x??'').localeCompare(String(y??''),undefined,{numeric:true,sensitivity:'base'});
        return compare(name(a),name(b)) || compare(a.season,b.season) || compare(a.label,b.label)
            || compare(JSON.stringify([a.f.arr_name,a.f.arr_fingerprint,a.f.media_id,a.h?.entry_name,a.j?.id]),JSON.stringify([b.f.arr_name,b.f.arr_fingerprint,b.f.media_id,b.h?.entry_name,b.j?.id]));
    }
    compareDates(a,b) {
        if(!a||!b)return a?-1:b?1:0;
        return this.sort==='retry'?a-b:b-a;
    }
    sortGroups(groups) {
        const value=group=>{
            const dates=group.map(row=>this.sortValue(row)).filter(Boolean);
            return dates.length?(this.sort==='retry'?Math.min(...dates):Math.max(...dates)):0;
        };
        for(const group of groups)group.sort((a,b)=>(this.sort==='name'?0:this.compareDates(this.sortValue(a),this.sortValue(b)))||this.compareNames(a,b));
        return groups.sort((a,b)=>(this.sort==='name'?0:this.compareDates(value(a),value(b)))||this.compareNames(a[0],b[0]));
    }
    formatDate(value) {return value?new Date(value).toLocaleString():'—';}
    async request(url, options={}) {
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
        try {
            const res=await fetch(url,{credentials:'same-origin',...options,signal:controller.signal});
            if(!res.ok)throw new Error((await res.text()).slice(0,300)||`HTTP ${res.status}`);
            return await res.json();
        } finally {clearTimeout(timer);}
    }
    async load() {
        if(this.loading)return;
        this.loading=true;clearTimeout(this.timer);
        try {
            this.data=await this.request(`${this.api}/repair/library`);
            this.updated=new Date();this.render();
            const q=this.data.queue||{};
            document.getElementById('libraryStatus').textContent=`${q.paused?'Queue paused. ':''}${q.in_flight||0}/${q.max_active||0} active recoveries · ${q.searching||0}/${q.search_workers||3} search workers. Updated ${this.updated.toLocaleTimeString()}.`;
        } catch(e) {
            document.getElementById('libraryStatus').textContent=`Tracking unavailable; ${this.updated?`showing data from ${this.updated.toLocaleTimeString()}`:'retrying automatically'}. ${e.message}`;
        } finally {this.loading=false;this.timer=setTimeout(()=>this.load(),10000);}
    }
    esc(value) {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    matches(f,b) {
        if(f.arr_name!==b.arrName || f.arr_fingerprint!==b.arrInstanceFingerprint)return false;
        if(f.arr_file_id>0 && f.arr_file_id===b.arrFileId)return true;
        if(f.arr_kind==='radarr')return f.media_id>0 && f.media_id===b.movieId;
        return f.media_id===b.seriesId && (b.episodeIds||[]).includes(f.episode_id);
    }
    rows() {
        const rows=[];const used=new Set();
        const jobs=this.data.jobs||[];
        const byMedia=new Map();
        const key=(name,fingerprint,id)=>JSON.stringify([name,fingerprint,id]);
        for(const j of jobs) for(const b of j.bindings||[]) {
            const k=key(b.arrName,b.arrInstanceFingerprint,b.movieId||b.seriesId);
            if(!byMedia.has(k))byMedia.set(k,new Set());byMedia.get(k).add(j);
        }
        for(const h of this.data.incidents||[]) {
            const f=h.library_file;
            const candidates=byMedia.get(key(f.arr_name,f.arr_fingerprint,f.media_id))||[];
            const matches=[...candidates].filter(j=>(j.bindings||[]).some(b=>this.matches(f,b)))
                .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
            const job=matches[0];matches.forEach(j=>used.add(j.id));
            rows.push(this.row(h,job,f));
        }
        for(const j of jobs) {
            if(used.has(j.id) || !(j.libraryAudit || (j.bindings||[]).some(b=>b.confidence==='library_file')))continue;
            for(const b of j.bindings||[])rows.push(this.row(null,j,{arr_name:b.arrName,arr_fingerprint:b.arrInstanceFingerprint,arr_kind:b.arrType,media_id:b.movieId||b.seriesId,season_number:b.seasonNumber,episode_id:b.episodeIds?.[0],source_path:b.libraryPath}));
        }
        return rows;
    }
    seasonNumber(f,j) {
        const valid=n=>Number.isInteger(n)&&n>=0;
        if(valid(f.season_number))return f.season_number;
        // Older audits did not persist seasons. Use only bindings for this file/episode.
        const seasons=new Set((j?.bindings||[]).filter(b=>this.matches(f,b))
            .map(b=>b.seasonNumber).filter(valid));
        if(seasons.size===1)return [...seasons][0];
        // Display-only fallback: never use a filename to authorize recovery actions.
        const parts=(f.source_path||'').split('/');
        const folder=parts.at(-2)||'';
        const directory=folder.match(/^(?:season|saison)\s+(\d+)$/i);
        if(directory)return Number(directory[1]);
        const filename=(parts.at(-1)||'').match(/(?:^|[ ._-])S(\d+)E\d+(?=$|[ ._-])/i);
        if(filename)return Number(filename[1]);
        if(/^specials$/i.test(folder))return 0;
        return null;
    }
    seriesLabel(row) {
        const parts=(row.f.source_path||'').split('/').filter(Boolean);
        const parent=parts.at(-2)||'';
        const seasonFolder=/^(?:(?:season|saison)\s+\d+|specials)$/i.test(parent);
        return (seasonFolder?parts.at(-3):parent)||row.label;
    }
    row(h,j,f) {
        const verified=h?.status==='healthy' && h.last_failed_at && (!j || j.status==='ready' || j.status==='cancelled');
        let category='pending';
        if(verified)category='resolved';
        else if(j && ['needs_attention','failed'].includes(j.status))category='attention';
        else if(j && ['resolving','invalidating','blocklisting','searching','waiting_for_grab','waiting_for_download','waiting_for_import','ready'].includes(j.status))category='active';
        const label=h?.display_name || f.source_path?.split('/').slice(-2).join(' / ') || `Media ${f.media_id}`;
        return {h,j,f,category,label,verified,season:this.seasonNumber(f,j)};
    }
    recoveryLabel(j) {
        if(!j)return 'Not queued';
        const labels={queued:'Queued',resolving:'Preparing',invalidating:'Preparing replacement',blocklisting:'Updating Arr history',searching:'Searching',waiting_for_grab:'Waiting for download to start',waiting_for_download:'Downloading',waiting_for_import:'Waiting for import',retry_scheduled:'Retry scheduled',needs_attention:'Needs attention',failed:'Failed',ready:'Imported',cancelled:'Cancelled'};
        return `${labels[j.status]||j.status}${j.paused?' · suspended':''}`;
    }
    render() {
        const rows=this.rows().filter(r=>(this.filter==='all'||r.category===this.filter)&&`${r.label} ${r.f.arr_name} ${r.f.source_path} ${r.h?.failure_reason||''} ${r.j?.lastError||''}`.toLowerCase().includes(this.query));
        // Group seasons but retain per-file diagnostics and actions.
        const groups=new Map();
        for(const row of rows) {
            const key=JSON.stringify([row.f.arr_name,row.f.arr_fingerprint,row.f.arr_kind,row.f.media_id,row.f.arr_kind==='sonarr'?row.season:0]);
            if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
        }
        const entries=this.sortGroups([...groups.values()]);const pages=Math.max(1,Math.ceil(entries.length/this.pageSize));this.page=Math.min(this.page,pages);
        this.visible=[];
        const html=entries.slice((this.page-1)*this.pageSize,this.page*this.pageSize).map(group=>{
            let prefix='';
            if(group[0].f.arr_kind==='sonarr') {
                const f=group[0].f;
                const key=JSON.stringify([f.arr_name,f.arr_fingerprint,f.media_id,group[0].season]);
                const open=this.expanded?.has(key);
                prefix=`<tr class="bg-base-200"><td colspan="7"><button class="btn btn-sm btn-ghost" data-group="${this.esc(key)}" aria-expanded="${!!open}">${open?'▾':'▸'} ${this.esc(this.seriesLabel(group[0]))} · Season ${this.esc(group[0].season??'unknown')} · ${group.length} findings</button></td></tr>`;
                if(!open)return prefix;
            }
            return prefix+group.map(row=>{
                const index=this.visible.push(row)-1;const {h,j,f}=row;
                const diagnosis=h?.status==='healthy'?'Readable':(h?.library_removed?'No file currently imported in Arr':h?.failure_reason||'Awaiting a library read');
                const actions=[];const button=(action,label)=>`<button class="btn btn-xs btn-outline" data-action="${action}" data-row="${index}">${label}</button>`;
                if(h)actions.push(button('recheck','Recheck'));
                if(j && (j.status==='retry_scheduled'||(j.status==='needs_attention'&&['no_download','search_error'].includes(j.retryReason))))actions.push(button('retry','Retry now'));
                else if(h?.status==='broken'&&!h.library_removed&&(!j||['ready','failed','cancelled'].includes(j.status))&&!h.library_paused)actions.push(button('repair','Repair'));
                const active=j&&!['ready','failed','cancelled'].includes(j.status);
                if(h||active)actions.push(button(h?.library_paused||j?.paused?'resume':'pause',h?.library_paused||j?.paused?'Resume':'Suspend'));
                actions.push(button('details','Details'));
                if(j?.status==='needs_attention')actions.push(`<a class="btn btn-xs btn-outline" href="${this.esc(window.urlBase)}repair/reacquire">Review recovery</a>`);
                const url=`${this.api}/repair/library/media?arr=${encodeURIComponent(f.arr_name)}&media=${encodeURIComponent(f.media_id)}`;
                actions.push(`<a class="btn btn-xs btn-ghost" href="${this.esc(url)}" target="_blank" rel="noopener noreferrer">${f.arr_kind==='radarr'?'Radarr':'Sonarr'} ↗</a>`);
                return `<tr><td class="break-all">${this.esc(row.label)}<div class="text-xs opacity-60">${this.esc(f.arr_name)}${h?.library_paused?' · automation suspended':''}</div></td><td>${this.esc(diagnosis)}</td><td>${this.esc(this.recoveryLabel(j))}${j?.status==='ready'&&!row.verified?'<div class="text-xs">Read validation pending</div>':''}${j?.lastError?`<div class="text-xs">${this.esc(j.lastError)}</div>`:''}${j?.observationError?'<div class="text-xs text-warning">Observation unavailable</div>':''}</td><td class="text-xs whitespace-nowrap">${this.esc(this.formatDate(this.changedAt(row)))}</td><td>${j?.retryCount||0}/${this.data.maxRetries||3}</td><td>${j?.retryAt?this.esc(new Date(j.retryAt).toLocaleString()):'—'}</td><td><div class="flex flex-wrap gap-1">${actions.join('')}</div></td></tr>`;
            }).join('');
        }).join('');
        document.getElementById('libraryRows').innerHTML=html||'<tr><td colspan="7">No findings in this view.</td></tr>';
        document.getElementById('libraryPageInfo').textContent=`${rows.length} findings · ${entries.length} media/season groups · Page ${this.page}/${pages}`;
        document.getElementById('libraryPrev').disabled=this.page<=1;document.getElementById('libraryNext').disabled=this.page>=pages;
    }
    async action(button) {
        const row=this.visible[Number(button.dataset.row)];if(!row)return;
        const {h,j,f}=row;const action=button.dataset.action;
        if(action==='details') {
            document.getElementById('libraryDetailsBody').textContent=JSON.stringify({path:f.source_path,diagnosis:h?.failure_reason,lastChecked:h?.last_checked_at,recovery:j?{status:j.status,error:j.lastError,observationError:j.observationError,nextAttempt:j.retryAt,attempts:j.attempts,currentMutations:j.mutations}:null},null,2);
            document.getElementById('libraryDetails').showModal();return;
        }
        if(action==='repair'&&!confirm('Queue replacement through Sonarr/Radarr for this broken file?'))return;
        button.disabled=true;
        const post=(url,body)=>this.request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        try {
            if(action==='retry') {
                if(h?.library_paused)await post(`${this.api}/repair/library/action`,{name:h.entry_name,action:'resume'});
                await post(`${this.api}/arr/reacquire/jobs/${encodeURIComponent(j.id)}/retry`,{});
            }
            else if(action==='pause'||action==='resume') {
                if(j&&!['ready','failed','cancelled'].includes(j.status))await post(`${this.api}/arr/reacquire/jobs/${encodeURIComponent(j.id)}/pause`,{paused:action==='pause'});
                if(h)await post(`${this.api}/repair/library/action`,{name:h.entry_name,action});
            } else await post(`${this.api}/repair/library/action`,{name:h.entry_name,action});
            await this.load();
        } catch(e) {document.getElementById('libraryStatus').textContent=`Action not completed: ${e.message}`;}
        finally {button.disabled=false;}
    }
}
window.LibraryRepairManager=LibraryRepairManager;
