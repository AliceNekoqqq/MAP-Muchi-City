/* 暮迟市地图 v2.0.0
 * 设计原则：底图即地图；01-11 是唯一交互对象。
 * 不再区分“探索地点 / 城区分区”，不再叠加路线层。
 */
function resolveHostWindow(){
  let w=window,best=window;
  for(let i=0;i<8;i++){
    try{
      if(w?.document?.body)best=w;
      if(!w.parent||w.parent===w)break;
      void w.parent.document;
      w=w.parent;
    }catch(_){break}
  }
  return best;
}

const MM_HOST=resolveHostWindow();
const MM_DOC=MM_HOST.document;
const MM_MODULE_BASE=new URL('../',import.meta.url).href;
const MM_BASES=[
  MM_MODULE_BASE,
  MM_MODULE_BASE.includes('cdn.jsdelivr.net')?MM_MODULE_BASE.replace('cdn.jsdelivr.net','fastly.jsdelivr.net'):MM_MODULE_BASE
];
const HOST_ID='muchi-map-host-v200';
const ROOT_ID='muchi-map-v200';
const STYLE_ID='muchi-map-style-v200';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let mapData=null;
let statData={};
let selectedId='';
let zoom=1;
let minZoom=.2;
let maxZoom=2.6;
let drag=null;
let bound=false;

function enc(path){return path.split('/').map(encodeURIComponent).join('/').replace(/%2F/g,'/')}
function asset(path,base=0){return MM_BASES[base]+enc(path)}
async function loadText(path){
  let last;
  for(let i=0;i<MM_BASES.length;i++){
    try{
      const r=await fetch(`${asset(path,i)}?v=2.0.0`,{cache:'no-store'});
      if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);
      return await r.text();
    }catch(e){last=e}
  }
  throw last||Error(`${path}: 加载失败`);
}
async function loadJson(path){return JSON.parse(await loadText(path))}
async function readStat(){
  try{const v=typeof getAllVariables==='function'?getAllVariables():{};return v?.stat_data||v||{}}
  catch(_){return {}}
}

function getHost(){return MM_DOC.getElementById(HOST_ID)}
function getRoot(){return getHost()?.shadowRoot?.getElementById(ROOT_ID)||null}
function ensureHost(){
  let host=getHost();
  if(host?.shadowRoot)return host;
  try{host?.remove()}catch{}
  host=MM_DOC.createElement('div');
  host.id=HOST_ID;
  host.style.cssText='position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:2147483646!important;display:block!important;visibility:visible!important;opacity:1!important;pointer-events:none!important;contain:none!important;isolation:isolate!important';
  (MM_DOC.body||MM_DOC.documentElement).appendChild(host);
  host.attachShadow({mode:'open'});
  return host;
}
async function ensureStyle(){
  const shadow=ensureHost().shadowRoot;
  let style=shadow.getElementById(STYLE_ID);
  if(style)return;
  const css=await loadText('Maps/style.css');
  style=MM_DOC.createElement('style');style.id=STYLE_ID;style.textContent=css;shadow.appendChild(style);
}

function shellHtml(){return `<div id="${ROOT_ID}" class="mm-root" aria-hidden="true">
  <section class="mm-shell" role="dialog" aria-modal="true" aria-label="暮迟市地图">
    <header class="mm-head">
      <div class="mm-title"><b>暮迟市地图</b><span>MU CHI CITY · 01—11 区域索引</span></div>
      <div class="mm-location"><span>当前地点</span><b data-ui="current-name">读取中…</b></div>
      <div class="mm-controls" aria-label="地图控制">
        <button type="button" data-act="zoom-out" aria-label="缩小">−</button>
        <button class="mm-zoom-label" type="button" data-act="fit" title="适应窗口"><span data-ui="zoom">100%</span></button>
        <button type="button" data-act="zoom-in" aria-label="放大">＋</button>
        <button class="mm-text-btn" type="button" data-act="locate">定位</button>
        <button class="mm-close" type="button" data-act="close" aria-label="关闭">×</button>
      </div>
    </header>
    <div class="mm-content">
      <main class="mm-map-area">
        <div class="mm-hint">拖动查看 · 点击底图上的 01–11 编号查看区域信息</div>
        <div class="mm-viewport" data-ui="viewport">
          <div class="mm-stage" data-ui="stage">
            <img class="mm-map" data-ui="map" alt="暮迟市城市地图" draggable="false">
            <div class="mm-hotspots" data-ui="hotspots"></div>
          </div>
        </div>
      </main>
      <aside class="mm-detail" data-ui="detail">
        <div class="mm-detail-empty"><i>01—11</i><b>选择区域</b><span>点击地图上已有的编号圆点查看详情。城区名称只作为底图信息，不再作为第二套交互层。</span></div>
      </aside>
    </div>
  </section>
</div>`}

function mount(){
  const host=ensureHost(),shadow=host.shadowRoot;
  let root=getRoot();if(root)return root;
  root=MM_DOC.createElement('div');root.innerHTML=shellHtml();root=root.firstElementChild;shadow.appendChild(root);
  bindRoot(root);return root;
}

function regionById(id){return mapData?.regions?.find(r=>r.id===String(id))||null}
function currentLocation(){return String(statData?.世界?.当前地点||'未知')}
function currentRegion(){
  const loc=currentLocation();
  return mapData?.regions?.find(r=>r.name===loc||(r.aliases||[]).includes(loc))||null;
}
function dynFor(name){return statData?.地图?.地点动态?.[name]||null}
function aggregateRegion(region){
  const names=[region.name,...(region.members||[])];
  const states=names.map(n=>({name:n,state:dynFor(n)})).filter(x=>x.state&&typeof x.state==='object');
  if(!states.length)return {states:[],resource:null,horde:null,passage:'暂无记录',tags:[],updated:'未知'};
  const avg=k=>{const a=states.map(x=>Number(x.state?.[k])).filter(Number.isFinite);return a.length?Math.round(a.reduce((s,n)=>s+n,0)/a.length):null};
  const order={'可通行':0,'谨慎通行':1,'受阻':2,'封锁':3};
  let passage='暂无记录',rank=-1;
  for(const x of states){const p=x.state?.通行状态;if(p in order&&order[p]>rank){rank=order[p];passage=p}}
  const tags=[...new Set(states.flatMap(x=>Array.isArray(x.state?.动态标签)?x.state.动态标签:[]))].slice(0,8);
  const times=states.map(x=>x.state?.最后更新时间).filter(Boolean);
  return {states,resource:avg('资源指数'),horde:avg('尸群指数'),passage,tags,updated:times.at(-1)||'未知'};
}
function riskClass(risk){return /极高|高/.test(risk)?'danger':/中/.test(risk)?'warn':'safe'}
function metricHtml(label,value,cls=''){
  if(value==null)return `<div class="mm-metric"><span>${esc(label)}</span><b>暂无记录</b></div>`;
  return `<div class="mm-metric"><span>${esc(label)}</span><div class="mm-meter"><i class="${cls}" style="width:${clamp(value,0,100)}%"></i></div><b>${clamp(value,0,100)}%</b></div>`
}
function renderDetail(root,region){
  const box=root.querySelector('[data-ui="detail"]');if(!box)return;
  if(!region){box.innerHTML='<div class="mm-detail-empty"><i>01—11</i><b>选择区域</b><span>点击地图上已有的编号圆点查看详情。</span></div>';return}
  const ag=aggregateRegion(region),cur=currentRegion()?.id===region.id;
  const stateRows=ag.states.length?ag.states.map(x=>`<div class="mm-subrow"><span>${esc(x.name)}</span><b>${esc(x.state?.通行状态||'状态未知')}</b></div>`).join(''):'<div class="mm-none">该区域尚无动态记录</div>';
  const tags=ag.tags.length?`<div class="mm-tags">${ag.tags.map(t=>`<i>${esc(t)}</i>`).join('')}</div>`:'';
  box.innerHTML=`<article class="mm-card">
    <div class="mm-photo"><img src="${esc(asset(region.image))}" alt="${esc(region.name)}"><div class="mm-photo-fade"></div><em>${esc(region.id)}</em></div>
    <div class="mm-card-body">
      <div class="mm-card-top"><div><small>${esc(region.type||'区域')}</small><h2>${esc(region.name)}</h2></div>${cur?'<span class="mm-current-badge">当前区域</span>':''}</div>
      <p class="mm-desc">${esc(region.description||'')}</p>
      <div class="mm-facts"><div><span>基础风险</span><b class="${riskClass(region.risk)}">${esc(region.risk||'未知')}</b></div><div><span>通行状态</span><b>${esc(ag.passage)}</b></div></div>
      ${metricHtml('资源指数',ag.resource)}
      ${metricHtml('尸群指数',ag.horde,'horde')}
      ${tags}
      <section class="mm-sub"><header><b>区域内已记录地点</b><span>${ag.states.length||0}</span></header>${stateRows}</section>
      <div class="mm-update">动态更新时间：${esc(ag.updated)}</div>
    </div>
  </article>`;
  const photo=box.querySelector('.mm-photo img');
  photo?.addEventListener('error',()=>{const wrap=photo.closest('.mm-photo');wrap?.classList.add('no-image');photo.remove()},{once:true});
}
function renderHotspots(root){
  const layer=root.querySelector('[data-ui="hotspots"]');if(!layer)return;
  const cur=currentRegion()?.id||'';
  layer.innerHTML=(mapData?.regions||[]).map(r=>`<button type="button" class="mm-hotspot${selectedId===r.id?' selected':''}${cur===r.id?' current':''}" data-region="${esc(r.id)}" style="left:${r.x}%;top:${r.y}%" aria-label="${esc(r.id+' '+r.name)}"><span>${esc(r.id)}</span></button>`).join('');
}
function render(root){
  root.querySelector('[data-ui="current-name"]').textContent=currentLocation();
  renderHotspots(root);
  renderDetail(root,selectedId?regionById(selectedId):null);
  updateZoomLabel(root);
}

function stage(root){return root.querySelector('[data-ui="stage"]')}
function viewport(root){return root.querySelector('[data-ui="viewport"]')}
function baseW(){return Number(mapData?.map?.width)||1536}
function baseH(){return Number(mapData?.map?.height)||1024}
function applyZoom(root){
  const s=stage(root);if(!s)return;
  s.style.width=`${Math.round(baseW()*zoom)}px`;
  s.style.height=`${Math.round(baseH()*zoom)}px`;
  updateZoomLabel(root);
}
function updateZoomLabel(root){const e=root.querySelector('[data-ui="zoom"]');if(e)e.textContent=`${Math.round(zoom*100)}%`}
function computeFit(root){
  const vp=viewport(root);if(!vp)return .5;
  const w=Math.max(200,vp.clientWidth-2),h=Math.max(160,vp.clientHeight-2);
  return clamp(Math.min(w/baseW(),h/baseH()),.18,1.3);
}
function fit(root){
  const vp=viewport(root);if(!vp)return;
  zoom=computeFit(root);minZoom=Math.min(.18,zoom*.65);maxZoom=Math.max(2.6,zoom*5);
  applyZoom(root);requestAnimationFrame(()=>{vp.scrollLeft=Math.max(0,(vp.scrollWidth-vp.clientWidth)/2);vp.scrollTop=Math.max(0,(vp.scrollHeight-vp.clientHeight)/2)});
}
function zoomAt(root,next,clientX=null,clientY=null){
  const vp=viewport(root);if(!vp)return;
  const old=zoom,newZoom=clamp(next,minZoom,maxZoom);if(Math.abs(newZoom-old)<.0001)return;
  const rect=vp.getBoundingClientRect();
  const px=clientX==null?vp.clientWidth/2:clientX-rect.left;
  const py=clientY==null?vp.clientHeight/2:clientY-rect.top;
  const wx=(vp.scrollLeft+px)/old,wy=(vp.scrollTop+py)/old;
  zoom=newZoom;applyZoom(root);
  vp.scrollLeft=wx*zoom-px;vp.scrollTop=wy*zoom-py;
}
function centerRegion(root,region,ensureReadable=false){
  if(!region)return;const vp=viewport(root);if(!vp)return;
  if(ensureReadable&&zoom<.72)zoomAt(root,.72);
  requestAnimationFrame(()=>{
    vp.scrollLeft=clamp((region.x/100)*baseW()*zoom-vp.clientWidth/2,0,Math.max(0,vp.scrollWidth-vp.clientWidth));
    vp.scrollTop=clamp((region.y/100)*baseH()*zoom-vp.clientHeight/2,0,Math.max(0,vp.scrollHeight-vp.clientHeight));
  });
}
function selectRegion(root,id,center=false){
  const r=regionById(id);if(!r)return;selectedId=r.id;render(root);if(center)centerRegion(root,r,false);
  root.classList.add('mm-has-detail');
}

function bindRoot(root){
  root.addEventListener('click',e=>{
    const spot=e.target.closest?.('[data-region]');if(spot){e.preventDefault();e.stopPropagation();selectRegion(root,spot.dataset.region,false);return}
    const b=e.target.closest?.('[data-act]');if(!b)return;const a=b.dataset.act;
    if(a==='close')return closeMap();
    if(a==='zoom-in')return zoomAt(root,zoom*1.2);
    if(a==='zoom-out')return zoomAt(root,zoom/1.2);
    if(a==='fit')return fit(root);
    if(a==='locate'){const r=currentRegion();if(r){selectRegion(root,r.id,false);centerRegion(root,r,true)}return}
  });
  const vp=viewport(root);
  vp.addEventListener('wheel',e=>{
    if(!(e.ctrlKey||e.metaKey))return;
    e.preventDefault();zoomAt(root,zoom*(e.deltaY<0?1.12:.89),e.clientX,e.clientY);
  },{passive:false});
  vp.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0||e.target.closest?.('[data-region]'))return;
    drag={x:e.clientX,y:e.clientY,left:vp.scrollLeft,top:vp.scrollTop,id:e.pointerId};
    vp.setPointerCapture?.(e.pointerId);vp.classList.add('dragging');e.preventDefault();
  });
  vp.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;vp.scrollLeft=drag.left-(e.clientX-drag.x);vp.scrollTop=drag.top-(e.clientY-drag.y)});
  const end=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;vp.classList.remove('dragging')};
  vp.addEventListener('pointerup',end);vp.addEventListener('pointercancel',end);
  root.addEventListener('click',e=>{if(e.target.closest?.('.mm-detail')&&e.target.matches?.('[data-detail-close]'))root.classList.remove('mm-has-detail')});
}

function setHostPointer(on){const h=ensureHost();h.style.setProperty('pointer-events',on?'auto':'none','important')}
function showError(root,e){root.querySelector('[data-ui="detail"]').innerHTML=`<div class="mm-detail-empty mm-error"><i>!</i><b>地图加载失败</b><span>${esc(e?.message||String(e))}</span></div>`}

export async function openMap(){
  const root=mount();setHostPointer(true);root.classList.add('open');root.setAttribute('aria-hidden','false');
  try{
    await ensureStyle();
    if(!mapData)mapData=await loadJson('Maps/map-data.json');
    statData=await readStat();
    const img=root.querySelector('[data-ui="map"]');
    if(!img.dataset.ready){img.dataset.ready='1';img.src=asset(mapData.map.image);img.onerror=()=>{if(img.dataset.fallback)return;img.dataset.fallback='1';img.src=asset(mapData.map.image,1)}}
    const cur=currentRegion();if(!selectedId&&cur)selectedId=cur.id;
    render(root);
    requestAnimationFrame(()=>{fit(root);if(cur)setTimeout(()=>centerRegion(root,cur,false),20)});
  }catch(e){console.error('[暮迟地图 v2] 打开失败',e);showError(root,e)}
  return root;
}
export function closeMap(){const root=getRoot();if(root){root.classList.remove('open','mm-has-detail');root.setAttribute('aria-hidden','true')}setHostPointer(false)}
export async function refreshMap(){mapData=null;statData=await readStat();return openMap()}

function accessibleWindows(){const out=[],seen=new Set();let w=window;for(let i=0;i<8;i++){try{if(!seen.has(w)){out.push(w);seen.add(w)}if(!w.parent||w.parent===w)break;void w.parent.document;w=w.parent}catch(_){break}}return out}
function installApi(){
  const api={open:openMap,close:closeMap,refresh:refreshMap,version:'2.0.0'};
  for(const w of accessibleWindows())try{w.MuchiMap=api}catch{}
  return api;
}
function bindDocument(doc){
  try{
    if(doc.__muchiMapBridgeV200)return;doc.__muchiMapBridgeV200=true;
    doc.addEventListener('click',e=>{const b=e.target?.closest?.('[data-muchi-map-open="1"]');if(!b)return;e.preventDefault();e.stopPropagation();openMap()},true);
  }catch(_){ }
}
function install(){
  installApi();for(const w of accessibleWindows())try{bindDocument(w.document)}catch{}
  if(bound)return;bound=true;
  try{if(typeof eventOn==='function'&&typeof getButtonEvent==='function')eventOn(getButtonEvent('暮迟地图'),openMap)}catch(e){console.warn('[暮迟地图 v2] 按钮绑定失败',e)}
  try{if(typeof eventOn==='function')eventOn('muchi:open-map',openMap)}catch(_){ }
  try{MM_DOC.addEventListener('keydown',e=>{if(e.key==='Escape'&&getRoot()?.classList.contains('open'))closeMap()})}catch(_){ }
}
install();setTimeout(install,700);
export const VERSION='2.0.0';
