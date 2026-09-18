const MM_BASES = [
  'https://cdn.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@v1.0.2/',
  'https://fastly.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@v1.0.2/'
];
const MM_STYLE_ID = 'muchi-map-style-v102';
const MM_CRITICAL_STYLE_ID = 'muchi-map-critical-v102';
const MM_ROOT_ID = 'muchi-map-overlay';
const MM_HOST = (()=>{try{return window.parent&&window.parent.document?window.parent:(window.top?.document?window.top:window)}catch(_){return window}})();
const MM_DOC = MM_HOST.document;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let mmData=null, mmStat=null, mmSelected='', mmShowLocations=true, mmShowDistricts=false, mmShowRoutes=true;
let view={scale:1,x:0,y:0,minScale:.2,maxScale:3.6,touched:false};
let pointers=new Map(), dragStart=null, pinchStart=null;

function installCriticalStyle(){
  if(MM_DOC.getElementById(MM_CRITICAL_STYLE_ID))return;
  const style=MM_DOC.createElement('style');style.id=MM_CRITICAL_STYLE_ID;
  style.textContent=`#${MM_ROOT_ID}{position:fixed;top:0;right:0;bottom:0;left:0;z-index:1000000;display:none;background:rgba(5,8,10,.92);color:#edf3f2;font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}#${MM_ROOT_ID}.mm-open{display:block}#${MM_ROOT_ID} *{box-sizing:border-box}#${MM_ROOT_ID} .mm-shell{position:absolute;top:8px;right:8px;bottom:8px;left:8px;overflow:hidden;border:1px solid rgba(194,216,219,.22);border-radius:18px;background:#0b1012}#${MM_ROOT_ID} .mm-head{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid rgba(188,209,212,.16)}#${MM_ROOT_ID} .mm-title{flex:1}#${MM_ROOT_ID} .mm-title b{display:block;font-size:17px}#${MM_ROOT_ID} .mm-title span,#${MM_ROOT_ID} .mm-current{font-size:9px;color:#91a0a3}#${MM_ROOT_ID} .mm-head-actions{margin-left:auto;display:flex;gap:6px}#${MM_ROOT_ID} button{min-height:36px;border:1px solid rgba(188,209,212,.18);border-radius:9px;background:#12191c;color:#dce7e7}#${MM_ROOT_ID} .mm-body{position:absolute;top:61px;right:0;bottom:0;left:0;display:grid;grid-template-columns:minmax(0,1fr) 320px}#${MM_ROOT_ID} .mm-main{position:relative;min-width:0;min-height:0}#${MM_ROOT_ID} .mm-side{overflow:auto;border-left:1px solid rgba(188,209,212,.16);background:#101619}#${MM_ROOT_ID} .mm-side-empty{display:flex;min-height:100%;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:11px;line-height:1.8;color:#91a0a3}@media(max-width:900px){#${MM_ROOT_ID} .mm-shell{top:0;right:0;bottom:0;left:0;border:0;border-radius:0}#${MM_ROOT_ID} .mm-current{display:none}#${MM_ROOT_ID} .mm-body{grid-template-columns:1fr}#${MM_ROOT_ID} .mm-side{position:absolute;left:8px;right:8px;bottom:8px;max-height:42%;border:1px solid rgba(188,209,212,.16);border-radius:14px}}`;
  MM_DOC.head.appendChild(style);
}

function cacheBust(url){return `${url}${url.includes('?')?'&':'?'}t=${Date.now()}`}
function enc(path){return path.split('/').map(encodeURIComponent).join('/').replace(/%2F/g,'/')}
function asset(path,base=0){return cacheBust(MM_BASES[base]+enc(path))}
async function textNoCache(path){let last;for(let i=0;i<MM_BASES.length;i++){try{const r=await fetch(asset(path,i),{cache:'no-store'});if(!r.ok)throw new Error(`${path}: ${r.status}`);return await r.text()}catch(e){last=e;console.warn('[暮迟地图] 资源源失败',MM_BASES[i],e)}}throw last||new Error(`${path}: 加载失败`)}
async function jsonNoCache(path){return JSON.parse(await textNoCache(path))}

async function loadStyle(force=false){
  let style=MM_DOC.getElementById(MM_STYLE_ID);
  if(style&&!force)return;
  try{
    const css=await textNoCache('Maps/style.css');
    if(!style){style=MM_DOC.createElement('style');style.id=MM_STYLE_ID;MM_DOC.head.appendChild(style)}
    style.textContent=css;
  }catch(e){console.error('[暮迟地图] CSS加载失败',e)}
}
async function loadData(){
  try{mmData=await jsonNoCache('Maps/map-data.json')}catch(e){console.error('[暮迟地图] 数据加载失败',e);throw e}
  return mmData;
}
async function getStat(){
  try{const v=getAllVariables()||{};return v?.stat_data||v||{}}
  catch(e){console.warn('[暮迟地图] 无法读取MVU',e);return {}}
}
function locState(name){return mmStat?.地图?.地点动态?.[name]||{}}
function currentName(){return mmStat?.世界?.当前地点||'未知'}
function byName(name){return mmData?.locations?.find(x=>x.name===name)||mmData?.districts?.find(x=>x.name===name)}
function pct(n){return clamp(Number(n)||0,0,100)}

function rootHtml(){return `<div class="mm-shell" role="dialog" aria-modal="true" aria-label="暮迟市地图">
  <header class="mm-head">
    <div class="mm-title"><b>暮迟市态势图</b><span>MU CHI CITY · EXTERNAL MAP TERMINAL</span></div>
    <div class="mm-current"><small>当前定位</small><strong class="mm-current-name">读取中…</strong></div>
    <div class="mm-head-actions"><button type="button" data-act="refresh" title="从GitHub重新读取地图资源">↻ 刷新资源</button><button class="mm-close" type="button" data-act="close" aria-label="关闭地图">×</button></div>
  </header>
  <div class="mm-body">
    <main class="mm-main">
      <div class="mm-toolbar">
        <div class="mm-tool"><button type="button" data-act="zoom-in" aria-label="放大">＋</button><button type="button" data-act="zoom-out" aria-label="缩小">－</button><button type="button" data-act="reset" aria-label="适应窗口">⌂</button><button type="button" data-act="home">当前定位</button></div>
        <div class="mm-search"><select aria-label="查找地点"></select><button type="button" data-act="search">查找</button></div>
        <div class="mm-layers"><button type="button" data-layer="locations" class="active">探索地点</button><button type="button" data-layer="districts">城区分区</button><button type="button" data-layer="routes" class="active">路线</button></div>
      </div>
      <div class="mm-viewport">
        <div class="mm-stage">
          <img class="mm-map-image" alt="暮迟市地图" draggable="false">
          <svg class="mm-routes" viewBox="0 0 1536 1024" preserveAspectRatio="none"></svg>
          <div class="mm-marker-layer"></div><div class="mm-map-vignette"></div>
        </div>
      </div>
    </main>
    <aside class="mm-side"><div class="mm-side-empty">地图资源加载中…</div><div class="mm-detail"></div></aside>
  </div>
</div>`}
function mount(){
  installCriticalStyle();
  let root=MM_DOC.getElementById(MM_ROOT_ID);if(root)return root;
  root=MM_DOC.createElement('div');root.id=MM_ROOT_ID;root.setAttribute('aria-hidden','true');root.innerHTML=rootHtml();MM_DOC.body.appendChild(root);
  bind(root);return root;
}
function populateSearch(root){
  const sel=root.querySelector('.mm-search select');if(!sel)return;
  sel.innerHTML=(mmData?.locations||[]).map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');
}
function renderRoutes(root){
  const svg=root.querySelector('.mm-routes');if(!svg)return;svg.innerHTML='';svg.style.display=mmShowRoutes?'block':'none';
  if(!mmShowRoutes)return;
  const map=new Map((mmData?.locations||[]).map(x=>[x.name,x]));
  for(const [a,b] of mmData?.routes||[]){const A=map.get(a),B=map.get(b);if(!A||!B)continue;const line=MM_DOC.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',String(A.x*15.36));line.setAttribute('y1',String(A.y*10.24));line.setAttribute('x2',String(B.x*15.36));line.setAttribute('y2',String(B.y*10.24));line.classList.add('mm-route');line.dataset.a=a;line.dataset.b=b;if(mmSelected&&(a===mmSelected||b===mmSelected))line.classList.add('active');svg.appendChild(line)}
}
function markerButton(p,kind){
  const b=MM_DOC.createElement('button');b.type='button';b.className='mm-marker '+(kind==='district'?'region ':'');b.dataset.name=p.name;b.style.left=`${p.x}%`;b.style.top=`${p.y}%`;b.innerHTML=`<span class="mm-pin">${esc(p.id.replace(/^L|^D/,''))}</span><span class="mm-name">${esc(p.name)}</span>`;
  if(kind==='location'&&p.name===currentName())b.classList.add('current');if(p.name===mmSelected)b.classList.add('selected');
  b.addEventListener('click',e=>{e.stopPropagation();selectPlace(p.name,true)});return b;
}
function renderMarkers(root){
  const layer=root.querySelector('.mm-marker-layer');if(!layer)return;layer.innerHTML='';
  if(mmShowLocations)(mmData?.locations||[]).forEach(p=>layer.appendChild(markerButton(p,'location')));
  if(mmShowDistricts)(mmData?.districts||[]).forEach(p=>layer.appendChild(markerButton(p,'district')));
}
function renderDetail(root,name){
  const detail=root.querySelector('.mm-detail'),empty=root.querySelector('.mm-side-empty');const p=byName(name);if(!p){detail.classList.remove('active');empty.style.display='flex';return}
  empty.style.display='none';detail.classList.add('active');const state=locState(p.name);const isLoc=!!mmData?.locations?.find(x=>x.name===p.name);const res=isLoc?(state.资源指数??'—'):'—',horde=isLoc?(state.尸群指数??'—'):'—',pass=isLoc?(state.通行状态||'未知'):'城区概览';const tags=Array.isArray(state.动态标签)?state.动态标签:[];const img=p.image?asset(p.image):'';
  const tagHtml=tags.length?tags.map(x=>`<span class="mm-tag hot">${esc(x)}</span>`).join(''):'<span class="mm-tag">无新增标签</span>';
  const neighbors=(p.neighbors||[]).map(x=>`<button type="button" data-neighbor="${esc(x)}">${esc(x)}</button>`).join('');
  detail.innerHTML=`<div class="mm-photo" style="background-image:url('${img}')"><span class="mm-photo-tag">${isLoc?'现场影像':'城区档案'}</span></div><div class="mm-info"><div class="mm-info-head"><div><h2>${esc(p.name)}</h2><p>${esc(p.district||'暮迟市城区分区')}</p></div><span class="mm-id">${esc(p.id)}</span></div>${isLoc?`<div class="mm-statgrid"><div class="mm-stat"><span>物资指数</span><b>${esc(res)}</b><div class="mm-bar"><i style="width:${pct(res)}%"></i></div></div><div class="mm-stat"><span>尸群密度</span><b>${esc(horde)}</b><div class="mm-bar danger"><i style="width:${pct(horde)}%"></i></div></div><div class="mm-stat"><span>基础风险</span><b>${esc(p.baseRisk||'未知')}</b></div><div class="mm-stat"><span>通行状态</span><b>${esc(pass)}</b></div></div><div class="mm-section resources"><label>物资倾向</label><p>${esc(p.resources||'未知')}</p></div><div class="mm-section intel"><label>已知情报</label><p>${esc(p.intel||'暂无')}</p></div><div class="mm-section"><label>动态标签</label><div class="mm-tags">${tagHtml}</div></div>${neighbors?`<div class="mm-section neighborsec"><label>相邻路线</label><div class="mm-neighbors">${neighbors}</div></div>`:''}<div class="mm-side-foot">坐标 ${Number(p.x).toFixed(2)} / ${Number(p.y).toFixed(2)} · ${esc(state.最后更新时间||'未记录更新时间')}</div>`:`<div class="mm-section intel"><label>城区说明</label><p>这是暮迟市的区域级坐标点，用于定位与宏观态势展示；具体探索仍以探索地点层为准。</p></div><div class="mm-side-foot">坐标 ${Number(p.x).toFixed(2)} / ${Number(p.y).toFixed(2)}</div>`}</div>`;
  detail.querySelectorAll('[data-neighbor]').forEach(b=>b.addEventListener('click',()=>selectPlace(b.dataset.neighbor,true)));
}
function updateCurrent(root){root.querySelector('.mm-current-name').textContent=currentName()}
function render(root){populateSearch(root);renderMarkers(root);renderRoutes(root);updateCurrent(root);renderDetail(root,mmSelected)}
function stagePoint(name){const p=byName(name);return p?{x:p.x*15.36,y:p.y*10.24}:null}
function applyView(root){const s=root.querySelector('.mm-stage');if(s)s.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`}
function fitView(root){const vp=root.querySelector('.mm-viewport');if(!vp)return;const r=vp.getBoundingClientRect();const w=mmData?.map?.width||1536,h=mmData?.map?.height||1024;view.scale=Math.min(r.width/w,r.height/h);view.minScale=Math.max(.12,view.scale*.62);view.maxScale=Math.max(2.8,view.scale*5);view.x=(r.width-w*view.scale)/2;view.y=(r.height-h*view.scale)/2;view.touched=false;applyView(root)}
function centerOn(root,name,desired){const p=stagePoint(name);const vp=root.querySelector('.mm-viewport');if(!p||!vp)return;const r=vp.getBoundingClientRect();const s=clamp(desired||Math.max(view.scale,Math.min(1.05,view.scale*1.8)),view.minScale,view.maxScale);view.scale=s;view.x=r.width/2-p.x*s;view.y=r.height/2-p.y*s;view.touched=true;applyView(root)}
function zoomAt(root,factor,cx,cy){const vp=root.querySelector('.mm-viewport');if(!vp)return;const r=vp.getBoundingClientRect();const x=(cx??r.width/2),y=(cy??r.height/2);const old=view.scale,neu=clamp(old*factor,view.minScale,view.maxScale);const wx=(x-view.x)/old,wy=(y-view.y)/old;view.scale=neu;view.x=x-wx*neu;view.y=y-wy*neu;view.touched=true;applyView(root)}
function selectPlace(name,center=false){const root=mount();mmSelected=name;renderMarkers(root);renderRoutes(root);renderDetail(root,name);const sel=root.querySelector('.mm-search select');if(sel&&[...sel.options].some(o=>o.value===name))sel.value=name;if(center)centerOn(root,name)}

function bind(root){
  root.addEventListener('click',e=>{const a=e.target.closest('[data-act]');if(!a)return;const act=a.dataset.act;if(act==='close')closeMap();if(act==='refresh')refreshResources();if(act==='zoom-in')zoomAt(root,1.22);if(act==='zoom-out')zoomAt(root,.82);if(act==='reset')fitView(root);if(act==='home'){const n=currentName();if(byName(n))selectPlace(n,true)}if(act==='search'){const n=root.querySelector('.mm-search select')?.value;if(n)selectPlace(n,true)}});
  root.querySelector('.mm-layers').addEventListener('click',e=>{const b=e.target.closest('[data-layer]');if(!b)return;const k=b.dataset.layer;if(k==='locations')mmShowLocations=!mmShowLocations;if(k==='districts')mmShowDistricts=!mmShowDistricts;if(k==='routes')mmShowRoutes=!mmShowRoutes;b.classList.toggle('active',k==='locations'?mmShowLocations:k==='districts'?mmShowDistricts:mmShowRoutes);renderMarkers(root);renderRoutes(root)});
  const vp=root.querySelector('.mm-viewport');
  vp.addEventListener('wheel',e=>{e.preventDefault();const r=vp.getBoundingClientRect();zoomAt(root,e.deltaY<0?1.12:.89,e.clientX-r.left,e.clientY-r.top)},{passive:false});
  vp.addEventListener('pointerdown',e=>{if(e.target.closest('.mm-marker'))return;vp.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)dragStart={px:e.clientX,py:e.clientY,x:view.x,y:view.y};if(pointers.size===2){const ps=[...pointers.values()];pinchStart={d:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),scale:view.scale,x:view.x,y:view.y,cx:(ps[0].x+ps[1].x)/2,cy:(ps[0].y+ps[1].y)/2}}});
  vp.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1&&dragStart){view.x=dragStart.x+(e.clientX-dragStart.px);view.y=dragStart.y+(e.clientY-dragStart.py);view.touched=true;applyView(root)}else if(pointers.size===2&&pinchStart){const ps=[...pointers.values()];const d=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);const newScale=clamp(pinchStart.scale*(d/(pinchStart.d||1)),view.minScale,view.maxScale);const r=vp.getBoundingClientRect();const cx=pinchStart.cx-r.left,cy=pinchStart.cy-r.top;const wx=(cx-pinchStart.x)/pinchStart.scale,wy=(cy-pinchStart.y)/pinchStart.scale;view.scale=newScale;view.x=cx-wx*newScale;view.y=cy-wy*newScale;view.touched=true;applyView(root)}});
  const end=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinchStart=null;if(!pointers.size)dragStart=null};vp.addEventListener('pointerup',end);vp.addEventListener('pointercancel',end);
  MM_DOC.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('mm-open'))closeMap()});
  MM_HOST.addEventListener?.('resize',()=>{if(root.classList.contains('mm-open')&&!view.touched)fitView(root)});
}

function showLoadError(root,e){
  try{
    root.classList.add('mm-open');root.setAttribute('aria-hidden','false');
    const empty=root.querySelector('.mm-side-empty');if(empty){empty.style.display='flex';empty.innerHTML=`<div><b>地图资源加载失败</b><br><span>${esc(e?.message||e||'未知错误')}</span><br><small>请确认 GitHub 仓库已上传 Maps/index.js、Maps/style.css、Maps/map-data.json 与 Assets/暮迟市地图.png。</small></div>`}
  }catch(_){}
}
async function refreshResources(){const root=mount();root.classList.add('mm-refreshing');try{await Promise.all([loadStyle(true),loadData()]);mmStat=await getStat();const img=root.querySelector('.mm-map-image');img.src=asset(mmData.map.image);render(root);if(!view.touched)setTimeout(()=>fitView(root),30)}catch(e){console.error('[暮迟地图] 刷新失败',e)}finally{root.classList.remove('mm-refreshing')}}
async function openMap(){
  const root=mount();root.classList.add('mm-open','mm-refreshing');root.setAttribute('aria-hidden','false');
  try{
    await loadStyle();await loadData();mmStat=await getStat();
    const img=root.querySelector('.mm-map-image');
    img.onerror=()=>{if(!img.dataset.fallback){img.dataset.fallback='1';img.src=asset(mmData.map.image,1)}};
    img.src=asset(mmData.map.image);render(root);
    const cur=currentName();if(!mmSelected&&byName(cur))mmSelected=cur;render(root);
    requestAnimationFrame(()=>{fitView(root);if(mmSelected)centerOn(root,mmSelected,Math.max(view.scale,view.scale*1.28))});
  }catch(e){console.error('[暮迟地图] 打开失败',e);showLoadError(root,e)}finally{root.classList.remove('mm-refreshing')}
}
function closeMap(){const root=MM_DOC.getElementById(MM_ROOT_ID);if(root){root.classList.remove('mm-open');root.setAttribute('aria-hidden','true')}}
let mmBound=false;
function installTriggers(){
  MM_HOST.MuchiMap={open:openMap,close:closeMap,refresh:refreshResources};
  if(mmBound)return;mmBound=true;
  try{eventOn(getButtonEvent('暮迟地图'),()=>openMap())}catch(e){mmBound=false;console.error('[暮迟地图] 按钮绑定失败',e);try{toastr?.error?.(`暮迟地图按钮绑定失败：${e?.message||e}`)}catch{}}
  try{eventOn('muchi:open-map',()=>openMap())}catch(e){console.warn('[暮迟地图] 自定义事件绑定失败',e)}
}
MM_HOST.MuchiMap={open:openMap,close:closeMap,refresh:refreshResources};
try{if(typeof $==='function')$(()=>installTriggers());else setTimeout(installTriggers,0)}catch{setTimeout(installTriggers,0)}
export {openMap,closeMap,refreshResources};
