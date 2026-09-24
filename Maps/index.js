/* 暮迟市地图 v2.9.0
 * 01-11 仍是区域交互对象；v2.6增加“已知幸存者设施”信息层，不新增任务点。
 * v2.6.0: 南桥区域可按玩家实际获知情报显示幸存者转运营；该信息不是任务箭头，也不是结构化搜刮节点。
 * v2.5.6: 手机端进一步缩为约92vw×80vh的明显留边窗口；探索入口按钮同步强化，并显示行动轮待推进状态；
 * v2.5.4: 在 v2.5.3 物资信息基础上联动角色卡“暮迟现场探索引擎”，显示探索完成度并允许当前地点直接进入探索；
 * 医疗区前端名称修正为“河西南部医疗区”，通过 intelKey 继续读取 MR-87 旧键“河东医疗区”。
 * 标题栏改用 pointer capture，手机端不启用窗口拖动。
 * 任一步骤失败都会完整回滚。
 */
function resolveTavernDocument(){
  /* Tavern Helper 官方脚本模型：脚本运行在后台 iframe，window.$ 被桥接到酒馆主页面。
   * 因此以 $(\'body\')[0].ownerDocument 作为唯一宿主来源，不再向 top 逐层猜测。 */
  try{
    const jq=globalThis.$;
    const body=jq?.('body')?.[0];
    if(body?.ownerDocument)return body.ownerDocument;
  }catch(_){}
  try{if(window.parent?.document?.body)return window.parent.document}catch(_){}
  return document;
}

const MM_DOC=resolveTavernDocument();
const MM_HOST=MM_DOC.defaultView||window.parent||window;
const MM_MODULE_BASE=new URL('../',import.meta.url).href;
const MM_BASES=[
  MM_MODULE_BASE,
  MM_MODULE_BASE.includes('cdn.jsdelivr.net')?MM_MODULE_BASE.replace('cdn.jsdelivr.net','testingcf.jsdelivr.net'):MM_MODULE_BASE,
  MM_MODULE_BASE.includes('cdn.jsdelivr.net')?MM_MODULE_BASE.replace('cdn.jsdelivr.net','fastly.jsdelivr.net'):MM_MODULE_BASE
].filter((v,i,a)=>a.indexOf(v)===i);

const FRAME_ID='muchi-map-frame-v250';
const ROOT_ID='muchi-map-v250';
const DRAG_LAYER_ID='muchi-map-drag-layer-v250';
const OLD_IDS=['muchi-map-frame-v242','muchi-map-v242','muchi-map-frame-v241','muchi-map-v241','muchi-map-frame-v240','muchi-map-v240','muchi-map-frame-v232','muchi-map-v232','muchi-map-frame-v231','muchi-map-v231','muchi-map-frame-v230','muchi-map-v230','muchi-map-frame-v220','muchi-map-v220','muchi-map-frame-v210','muchi-map-v210','muchi-map-host-v200','muchi-map-v200','muchi-map-host-v104','muchi-map-root-v104'];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let mapData=null;
let cssText='';
let statData={};
let selectedId='';
let zoom=1;
let minZoom=.18;
let maxZoom=2.6;
let drag=null;
const touchPoints=new Map();
let touchPan=null;
let touchPinch=null;
let frameDrag=null;
let bound=false;
let opening=null;
let hostResizeHandler=null;

function enc(path){return path.split('/').map(encodeURIComponent).join('/').replace(/%2F/g,'/')}
function asset(path,base=0){return MM_BASES[Math.min(base,MM_BASES.length-1)]+enc(path)}
async function loadText(path){
  let last;
  for(let i=0;i<MM_BASES.length;i++){
    try{
      const r=await fetch(`${asset(path,i)}?v=2.9.0`,{cache:'no-store'});
      if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);
      return await r.text();
    }catch(e){last=e}
  }
  throw last||Error(`${path}: 加载失败`);
}
async function loadJson(path){return JSON.parse(await loadText(path))}
async function readStat(){
  const normalize=v=>v?.stat_data&&typeof v.stat_data==='object'?v.stat_data:(v&&typeof v==='object'?v:{});
  const mergedReaders=[globalThis.getAllVariables,MM_HOST?.getAllVariables].filter(fn=>typeof fn==='function');
  for(const fn of mergedReaders){
    try{const v=normalize(fn());if(Object.keys(v).length)return v}catch(_){}
  }
  const scopedReaders=[globalThis.getVariables,MM_HOST?.getVariables].filter(fn=>typeof fn==='function');
  for(const fn of scopedReaders){
    for(const option of [{type:'message',message_id:-1},{type:'chat'}]){
      try{const v=normalize(fn(option));if(Object.keys(v).length)return v}catch(_){}
    }
  }
  return {};
}
function notifyError(message){
  const text=`暮迟地图打开失败：${message}`;
  try{MM_HOST.toastr?.error?.(text)}catch{}
  console.error('[暮迟地图 v2.9.0]',text);
}

function cleanupStale(){
  drag=null;
  frameDrag=null;
  if(hostResizeHandler){try{MM_HOST.removeEventListener?.('resize',hostResizeHandler)}catch{}try{MM_HOST.visualViewport?.removeEventListener?.('resize',hostResizeHandler);MM_HOST.visualViewport?.removeEventListener?.('scroll',hostResizeHandler)}catch{} hostResizeHandler=null;}
  try{MM_DOC.getElementById(DRAG_LAYER_ID)?.remove()}catch{}
  try{MM_DOC.getElementById(FRAME_ID)?.remove()}catch{}
  for(const id of OLD_IDS)try{MM_DOC.getElementById(id)?.remove()}catch{}
  try{MM_DOC.querySelectorAll('[id^="muchi-map-host-v"],[id^="muchi-map-frame-v"]').forEach(el=>{if(el.id!==FRAME_ID)el.remove()})}catch{}
}
function getFrame(){return MM_DOC.getElementById(FRAME_ID)}
function getFrameDoc(){try{return getFrame()?.contentDocument||null}catch{return null}}
function getRoot(){return getFrameDoc()?.getElementById(ROOT_ID)||null}
function syncDisplayMode(root){
  if(!root)return;
  const mobile=hostViewport().w<=900;
  root.classList.toggle('mm-mobile',mobile);
  const doc=root.ownerDocument;
  doc?.documentElement?.classList.toggle('mm-mobile-doc',mobile);
  doc?.body?.classList.toggle('mm-mobile-doc',mobile);
}
async function prepareResources(){
  if(mapData&&cssText)return;
  const [css,data]=await Promise.all([
    cssText?Promise.resolve(cssText):loadText('Maps/style.css'),
    mapData?Promise.resolve(mapData):loadJson('Maps/map-data.json')
  ]);
  cssText=css;
  mapData=data;
}

function shellHtml(){const mobile=hostViewport().w<=900;return `<section id="${ROOT_ID}" class="mm-root open${mobile?' mm-mobile':''}" role="dialog" aria-modal="true" aria-label="暮迟市地图">
  <div class="mm-shell">
    <header class="mm-head" title="拖动窗口">
      <i class="mm-drag-grip" aria-hidden="true"></i>
      <div class="mm-title"><b>暮迟市地图</b><span>MU CHI CITY · 01—11 区域索引</span></div>
      <div class="mm-location"><span>当前地点</span><b data-ui="current-name">读取中…</b></div>
      <div class="mm-controls" aria-label="地图控制">
        <button type="button" data-act="zoom-out" aria-label="缩小">−</button>
        <button class="mm-zoom-label" type="button" data-act="fit" title="适应窗口"><span data-ui="zoom">100%</span></button>
        <button type="button" data-act="zoom-in" aria-label="放大">＋</button>
        <button class="mm-text-btn" type="button" data-act="locate" aria-label="定位当前区域"><i>◎</i><span>定位</span></button>
        <button class="mm-close" type="button" data-act="close" aria-label="关闭">×</button>
      </div>
    </header>
    <div class="mm-content">
      <main class="mm-map-area">
        <div class="mm-hint">单指拖动 · 双指缩放 · 点击区域</div>
        <div class="mm-viewport" data-ui="viewport">
          <div class="mm-stage" data-ui="stage">
            <img class="mm-map" data-ui="map" alt="暮迟市城市地图" draggable="false">
            <div class="mm-fog-layer" data-ui="fog" aria-hidden="true"></div>
            <div class="mm-hotspots" data-ui="hotspots"></div>
          </div>
        </div>
      </main>
      <aside class="mm-detail" data-ui="detail">
        <div class="mm-detail-empty"><i>01—11</i><b>选择区域</b><span>点击地图上的编号圆点查看详情。</span></div>
      </aside>
    </div>
  </div>
</section>`}

function hostViewport(){
  const de=MM_DOC.documentElement,body=MM_DOC.body,vv=MM_HOST?.visualViewport;
  const visualW=Number(vv?.width)||0,visualH=Number(vv?.height)||0;
  const w=Math.max(320,visualW||Number(MM_HOST?.innerWidth)||de?.clientWidth||body?.clientWidth||1280);
  const h=Math.max(480,visualH||Number(MM_HOST?.innerHeight)||de?.clientHeight||body?.clientHeight||800);
  const x=Math.max(0,Number(vv?.offsetLeft)||0),y=Math.max(0,Number(vv?.offsetTop)||0);
  return {w,h,x,y};
}
function desktopFrameSize(){
  const {w:vw,h:vh}=hostViewport();
  const head=vh<700?50:54;
  /* PC 主窗只为地图服务，不再给右侧详情预留一整列。
   * 宽度默认约 72vw，最大 980px；再根据可用高度反向收缩，避免横向霸屏。 */
  const sideGap=vw<1180?44:72;
  const maxW=Math.max(680,Math.min(980,vw-sideGap));
  let width=clamp(Math.round(vw*.72),720,maxW);
  const maxFrameH=Math.max(520,Math.min(720,Math.round(vh*.82),vh-48));
  width=Math.min(width,Math.max(660,(maxFrameH-head)*1.5));
  width=Math.min(width,maxW);
  const height=Math.round(width/1.5+head);
  return {width:Math.round(width),height,head};
}
function applyFrameLayout(frame){
  if(!frame)return;
  const {w,h,x,y}=hostViewport();
  const centerX=x+w/2,centerY=y+h/2;
  if(w<=900){
    /* v2.5.6: 手机端必须肉眼可见地缩小，而不是只留十来像素边缘。
     * 宽度约 92vw，高度通常约 80vh；短屏稍放宽到 84vh，仍保留明显上下空间。
     * 详情区继续在 iframe 内部滚动，避免浏览器地址栏/底栏遮住尾部。 */
    /* v2.9.0 mobile: near-full visible viewport, while keeping a small safe margin. */
    const width=Math.min(Math.max(300,Math.round(w*.97)),Math.max(300,Math.round(w-8)));
    const ratio=h<700?.96:.94;
    const height=Math.min(Math.max(420,Math.round(h*ratio)),Math.max(400,Math.round(h-10)));
    const radius=w<=430?16:18;
    frame.style.cssText=`position:fixed!important;left:${centerX}px!important;top:${centerY}px!important;width:${width}px!important;height:${height}px!important;transform:translate(-50%,-50%)!important;border:0!important;border-radius:${radius}px!important;margin:0!important;padding:0!important;z-index:2147483647!important;background:transparent!important;display:block!important;overflow:hidden!important;box-shadow:0 22px 70px rgba(0,0,0,.58),0 0 0 1px rgba(174,202,204,.12)!important;`;
    return;
  }
  const size=desktopFrameSize();
  frame.style.cssText=`position:fixed!important;left:${centerX}px!important;top:${centerY}px!important;width:${size.width}px!important;height:${size.height}px!important;transform:translate(-50%,-50%)!important;border:0!important;border-radius:18px!important;margin:0!important;padding:0!important;z-index:2147483647!important;background:transparent!important;display:block!important;overflow:hidden!important;box-shadow:0 22px 72px rgba(0,0,0,.34),0 0 0 1px rgba(174,202,204,.05)!important;`;
}
function mount(){
  cleanupStale();
  if(!cssText)throw Error('地图样式尚未准备完成');
  const frame=MM_DOC.createElement('iframe');
  frame.id=FRAME_ID;
  frame.setAttribute('frameborder','0');
  frame.setAttribute('title','暮迟市地图');
  applyFrameLayout(frame);
  (MM_DOC.body||MM_DOC.documentElement).appendChild(frame);
  const doc=frame.contentDocument;
  if(!doc)throw Error('地图 iframe 无法访问');
  doc.open();
  const mobileDoc=hostViewport().w<=900;
  doc.write(`<!doctype html><html class="${mobileDoc?'mm-mobile-doc':''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important}body{font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif}</style><style>${cssText}</style></head><body class="${mobileDoc?'mm-mobile-doc':''}">${shellHtml()}</body></html>`);
  doc.close();
  const root=doc.getElementById(ROOT_ID);
  if(!root)throw Error('地图界面创建失败');
  syncDisplayMode(root);
  bindRoot(root);
  doc.addEventListener('keydown',e=>{if(e.key==='Escape')closeMap()});
  hostResizeHandler=()=>{
    const live=getFrame();if(live!==frame)return;
    applyFrameLayout(frame);
    setTimeout(()=>{const r=getRoot();if(r){syncDisplayMode(r);layoutDesktop(r);fit(r,!isDesktop(r))}},30);
  };
  try{MM_HOST.addEventListener?.('resize',hostResizeHandler,{passive:true})}catch{}
  try{MM_HOST.visualViewport?.addEventListener?.('resize',hostResizeHandler,{passive:true});MM_HOST.visualViewport?.addEventListener?.('scroll',hostResizeHandler,{passive:true})}catch{}
  return root;
}

function regionById(id){return mapData?.regions?.find(r=>r.id===String(id))||null}
function currentLocation(){return String(statData?.世界?.当前地点||'未知')}
function currentRegion(){
  const loc=currentLocation();
  return mapData?.regions?.find(r=>r.name===loc||(r.aliases||[]).includes(loc))||null;
}
function intelFor(region){const k=region?.intelKey||region?.name;return statData?.地图?.区域情报?.[k]||null}
function currentDay(){return Number(statData?.世界?.灾变日||0)}
function intelStatus(region){
  const x=intelFor(region)||{},raw=String(x.情报状态||'未知'),last=Number(x.最后更新日||0),day=currentDay();
  if(raw!=='未知'&&last>0&&day-last>=3)return'过期';
  return['未知','传闻','已确认','过期'].includes(raw)?raw:'未知';
}
function intelView(region){
  const x=intelFor(region)||{},status=intelStatus(region);
  return{status,resource:x.资源已知?clamp(Number(x.资源指数||0),0,100):null,horde:x.尸群已知?clamp(Number(x.尸群指数||0),0,100):null,passage:String(x.通行状态||'未知'),tags:Array.isArray(x.动态标签)?x.动态标签.slice(0,8):[],summary:String(x.情报摘要||''),source:String(x.情报来源||''),confidence:Number(x.置信度||0),firstDay:Number(x.首次发现日||0),lastDay:Number(x.最后更新日||0),updated:String(x.最后更新时间||''),resourceTrend:String(x.资源趋势||'未知'),hordeTrend:String(x.尸群趋势||'未知')};
}
function riskClass(risk){return /极高|高/.test(risk)?'danger':/中/.test(risk)?'warn':'safe'}
function statusClass(s){return s==='已确认'?'confirmed':s==='传闻'?'rumor':s==='过期'?'stale':'unknown'}
function trendHtml(trend){if(trend==='上升')return'<small class="mm-trend up">↑ 较上次情报上升</small>';if(trend==='下降')return'<small class="mm-trend down">↓ 较上次情报下降</small>';if(trend==='稳定')return'<small class="mm-trend flat">≈ 与上次接近</small>';return''}
function metricHtml(label,value,cls='',trend='未知'){
  if(value==null)return `<div class="mm-metric is-unknown"><span>${esc(label)}</span><b>未知</b><small>尚未获得可靠情报</small></div>`;
  return `<div class="mm-metric"><span>${esc(label)}</span><div class="mm-meter"><i class="${cls}" style="width:${clamp(value,0,100)}%"></i></div><b>${clamp(value,0,100)}%</b>${trendHtml(trend)}</div>`;
}
function exploreSummary(name){try{return MM_HOST.MuchiExplore?.summary?.(name,statData)||null}catch{return null}}
function exploreActionHtml(name){
  const s=exploreSummary(name),isCurrent=currentLocation()===name;
  const round=s?.roundState==='待剧情推进'?' · 待剧情推进':s?.roundState==='进行中'?` · 本轮余${s.roundRemaining}`:'';
  const label=s?`探索 ${s.percent}%${s.pending?` · ${s.pending}批待收取`:''}${round}`:'可探索';
  return `<span class="mm-sub-actions"><b>${esc(label)}</b>${isCurrent?`<button type="button" data-act="explore" data-location="${esc(name)}">进入现场探索</button>`:''}</span>`;
}
function survivorTransitKnown(){
  const p=statData?.暗线?.父母||{},clues=Array.isArray(p.已知线索)?p.已知线索:[];
  if(clues.some(x=>String(x).includes('南桥南岸临时转运营')))return true;
  if(['前往安置点','隔离线分别','已安置'].includes(String(p.阶段||'')))return true;
  if(String(p.安置地点||'').includes('南桥南岸'))return true;
  const x=statData?.地图?.区域情报?.['南桥']||{};
  const text=[x.情报摘要,x.情报来源,...(Array.isArray(x.动态标签)?x.动态标签:[])].join(' ');
  return /南桥南岸临时转运营|临时转运营|转运点|隔离点|撤离点|安置点|幸存者营地|幸存者聚落|撤离车队|接收幸存者/.test(text);
}
function specialMemberVisible(m){if(!m)return false;if(m.visibility==='survivor_transit_known')return survivorTransitKnown();return true}
function specialMemberHtml(m){
  const p=statData?.暗线?.父母||{},settled=String(p.状态||'')==='已安置'&&String(p.安置地点||'').includes(String(m.name||''));
  const title=m.displayName||m.name||'已知幸存者设施';
  const photo=m.image?`<div class="mm-special-photo"><img src="${esc(asset(m.image))}" alt="${esc(title)}"><div class="mm-special-photo-fade"></div><em>已知幸存者设施</em></div>`:'';
  return `<div class="mm-special-site">${photo}<div class="mm-special-body"><span><strong>${esc(title)}</strong><small>${esc(m.note||'来自玩家已获得情报的幸存者设施。')}</small></span><span class="mm-sub-actions"><b>${settled?'父母已安置':'已知幸存者设施'}</b><small>${esc(m.kind||'非探索节点')} · 非任务目标</small></span></div></div>`;
}
function renderDetail(root,region){
  const box=root.querySelector('[data-ui="detail"]');if(!box)return;
  if(!region){box.classList.remove('is-open');box.innerHTML='<div class="mm-detail-empty"><i>01—11</i><b>选择区域</b><span>点击地图上的编号圆点查看详情。</span></div>';return}
  box.classList.add('is-open');
  const intel=intelView(region),cur=currentRegion()?.id===region.id,members=[...(region.members||[])],specials=[...(region.specialMembers||[])].filter(specialMemberVisible);
  const normalRows=members.map(name=>`<div class="mm-subrow"><span><strong>${esc(name)}</strong><small>${esc(region.memberNotes?.[name]||'可直接进入的具体探索节点')}</small></span>${exploreActionHtml(name)}</div>`).join(''),specialRows=specials.map(specialMemberHtml).join(''),memberRows=(normalRows+specialRows)||`<div class="mm-none"><b>当前仅开放区域情报</b><span>${esc(region.explorationStatus||'暂无可直接搜刮的具体节点')}</span></div>`;
  const tags=intel.tags.length?`<div class="mm-tags">${intel.tags.map(t=>`<i>${esc(t)}</i>`).join('')}</div>`:'';
  const intelMeta=intel.status==='未知'?'<div class="mm-intel-empty">实时资源、尸群与道路情况尚未获得。等待 MR-87 暮迟市频道或后续可靠情报。</div>':`<div class="mm-intel-summary"><p>${esc(intel.summary||'已收到区域情报，但摘要不完整。')}</p><div><span>来源</span><b>${esc(intel.source||'暮迟市公共广播')}</b></div><div><span>置信度</span><b>${clamp(intel.confidence,0,100)}%</b></div></div>`;
  box.innerHTML=`<article class="mm-card">
    <button class="mm-detail-close" type="button" data-act="detail-close" aria-label="收起区域详情">×</button>
    <div class="mm-photo"><img src="${esc(asset(region.image))}" alt="${esc(region.name)}"><div class="mm-photo-fade"></div><em>${esc(region.id)}</em></div>
    <div class="mm-card-body">
      <div class="mm-card-top"><div><small>${esc(region.type||'区域')}</small><h2>${esc(region.name)}</h2></div><div class="mm-card-badges">${cur?'<span class="mm-current-badge">当前区域</span>':''}<span class="mm-intel-badge ${statusClass(intel.status)}">${esc(intel.status)}</span></div></div>
      <p class="mm-desc">${esc(region.description||'')}</p>
      <div class="mm-supply-profile"><span>物资倾向</span><b>${esc(region.supplyProfile||'未整理')}</b></div>
      <div class="mm-facts"><div><span>基础风险</span><b class="${riskClass(region.risk)}">${esc(region.risk||'未知')}</b></div><div><span>通行情报</span><b>${esc(intel.passage||'未知')}</b></div></div>
      ${metricHtml('资源指数',intel.resource,'',intel.resourceTrend)}
      ${metricHtml('尸群指数',intel.horde,'horde',intel.hordeTrend)}
      ${tags}
      ${intelMeta}
      <section class="mm-sub"><header><b>区域内已知地点</b><span>${members.length+specials.length}</span></header>${memberRows}</section>
      <div class="mm-update">${intel.status==='未知'?'最后情报：暂无':`最后情报：第${intel.lastDay||'?'}日 · ${esc(intel.updated||'时间未知')}`}</div>
    </div>
  </article>`;
  const photo=box.querySelector('.mm-photo img');photo?.addEventListener('error',()=>{const wrap=photo.closest('.mm-photo');wrap?.classList.add('no-image');photo.remove()},{once:true});
  box.querySelectorAll('.mm-special-photo img').forEach(img=>img.addEventListener('error',()=>{img.closest('.mm-special-photo')?.classList.add('no-image');img.remove()},{once:true}));
}
function renderHotspots(root){
  const layer=root.querySelector('[data-ui="hotspots"]');if(!layer)return;const cur=currentRegion()?.id||'';
  const fog=root.querySelector('[data-ui="fog"]');
  if(fog)fog.innerHTML=(mapData?.regions||[]).filter(r=>intelStatus(r)==='未知'&&cur!==r.id).map(r=>`<span class="mm-fog-patch" style="left:${Number(r.x)}%;top:${Number(r.y)}%"></span>`).join('');
  const normal=(mapData?.regions||[]).map(r=>{const st=intelStatus(r);return `<button type="button" class="mm-hotspot intel-${st==='已确认'?'confirmed':st==='传闻'?'rumor':st==='过期'?'stale':'unknown'}${selectedId===r.id?' selected':''}${cur===r.id?' current':''}" data-region="${esc(r.id)}" style="left:${r.x}%;top:${r.y}%" aria-label="${esc(r.id+' '+r.name+' '+st)}"><span>${esc(r.id)}</span></button>`}).join('');
  const special=(mapData?.regions||[]).flatMap(r=>(r.specialMembers||[]).filter(m=>specialMemberVisible(m)&&Number.isFinite(Number(m.mapX))&&Number.isFinite(Number(m.mapY))).map(m=>`<button type="button" class="mm-hotspot mm-special-hotspot${selectedId===r.id?' selected':''}" data-region="${esc(r.id)}" data-special-site="${esc(m.name||'')}" style="left:${Number(m.mapX)}%;top:${Number(m.mapY)}%" aria-label="${esc((m.displayName||m.name||'幸存者设施')+' 已知幸存者设施')}"><span>${esc(m.marker||'◆')}</span></button>`)).join('');
  layer.innerHTML=normal+special;
}
function render(root){
  const name=root.querySelector('[data-ui="current-name"]');if(name)name.textContent=currentLocation();
  renderHotspots(root);
  renderDetail(root,selectedId?regionById(selectedId):null);
  updateZoomLabel(root);
}

function stage(root){return root.querySelector('[data-ui="stage"]')}
function viewport(root){return root.querySelector('[data-ui="viewport"]')}
function baseW(){return Number(mapData?.map?.width)||1536}
function baseH(){return Number(mapData?.map?.height)||1024}
function isDesktop(){return hostViewport().w>900}
function layoutDesktop(root){
  const {w:vw,h:vh}=hostViewport();
  if(vw<=900){root.style.removeProperty('--head-h');return;}
  root.style.setProperty('--head-h',`${vh<700?50:54}px`);
}
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
function fit(root,readableMobile=false){
  const vp=viewport(root);if(!vp)return;
  const overview=computeFit(root);
  zoom=overview;
  /* 手机默认使用可读视图：不强行一次塞下整张城市地图，而是让地图接近填满画布高度；“适应”按钮仍可回到全城总览。 */
  if(readableMobile&&!isDesktop(root)){
    const heightFill=(Math.max(160,vp.clientHeight-2)/baseH())*.96;
    zoom=clamp(Math.max(overview*1.42,Math.min(heightFill,overview*1.9)),overview,1.35);
  }
  minZoom=isDesktop(root)?overview:Math.max(.12,Math.min(overview*.65,.28));
  maxZoom=Math.max(2.6,overview*5,zoom*3.2);
  applyZoom(root);
  requestAnimationFrame(()=>{vp.scrollLeft=Math.max(0,(vp.scrollWidth-vp.clientWidth)/2);vp.scrollTop=Math.max(0,(vp.scrollHeight-vp.clientHeight)/2)});
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
  const r=regionById(id);if(!r)return;const changed=selectedId!==r.id;selectedId=r.id;render(root);if(center)centerRegion(root,r,false);
  root.classList.add('mm-has-detail');
  if(changed&&/极高|高/.test(r.risk)){
    const area=root.querySelector('.mm-map-area');area?.querySelector('.mm-entry-cue')?.remove();
    const cue=root.ownerDocument.createElement('div');cue.className='mm-entry-cue';cue.textContent=`警戒区域 / ${r.name}`;
    area?.appendChild(cue);setTimeout(()=>cue.remove(),1500);
  }
}


function bindFrameDrag(root){
  const frame=getFrame();
  const head=root?.querySelector?.('.mm-head');
  if(!frame||!head||head.dataset.dragBound==='1')return;
  head.dataset.dragBound='1';
  const stop=e=>{
    if(!frameDrag)return;
    try{if(e?.pointerId!=null&&head.hasPointerCapture?.(e.pointerId))head.releasePointerCapture(e.pointerId)}catch{}
    frameDrag=null;
    root.classList.remove('mm-window-dragging');
  };
  head.addEventListener('pointerdown',e=>{
    if(hostViewport().w<=900)return;
    if(e.button!==0)return;
    if(e.target?.closest?.('.mm-controls,button,a,input,select,textarea,[data-no-window-drag]'))return;
    const rect=frame.getBoundingClientRect();
    frame.style.setProperty('left',`${Math.round(rect.left)}px`,'important');
    frame.style.setProperty('top',`${Math.round(rect.top)}px`,'important');
    frame.style.setProperty('right','auto','important');
    frame.style.setProperty('bottom','auto','important');
    frame.style.setProperty('transform','none','important');
    frameDrag={
      id:e.pointerId,
      startX:Number(e.screenX)||0,
      startY:Number(e.screenY)||0,
      left:rect.left,
      top:rect.top,
      width:rect.width,
      height:rect.height
    };
    try{head.setPointerCapture?.(e.pointerId)}catch{}
    root.classList.add('mm-window-dragging');
    e.preventDefault();
  });
  head.addEventListener('pointermove',e=>{
    if(!frameDrag||e.pointerId!==frameDrag.id)return;
    const {w,h}=hostViewport();
    const pad=8;
    const maxLeft=Math.max(pad,w-frameDrag.width-pad);
    const maxTop=Math.max(pad,h-frameDrag.height-pad);
    const dx=(Number(e.screenX)||0)-frameDrag.startX;
    const dy=(Number(e.screenY)||0)-frameDrag.startY;
    frame.style.setProperty('left',`${Math.round(clamp(frameDrag.left+dx,pad,maxLeft))}px`,'important');
    frame.style.setProperty('top',`${Math.round(clamp(frameDrag.top+dy,pad,maxTop))}px`,'important');
  });
  head.addEventListener('pointerup',stop);
  head.addEventListener('pointercancel',stop);
  head.addEventListener('lostpointercapture',()=>{
    frameDrag=null;
    root.classList.remove('mm-window-dragging');
  });
}

function bindRoot(root){
  bindFrameDrag(root);
  root.addEventListener('click',e=>{
    if(e.target===root){closeMap();return}
    const spot=e.target.closest?.('[data-region]');if(spot){e.preventDefault();e.stopPropagation();selectRegion(root,spot.dataset.region,false);return}
    const b=e.target.closest?.('[data-act]');if(!b)return;const a=b.dataset.act;
    if(a==='close')return closeMap();
    if(a==='detail-close'){selectedId='';root.classList.remove('mm-has-detail');render(root);return}
    if(a==='zoom-in')return zoomAt(root,zoom*1.2);
    if(a==='zoom-out')return zoomAt(root,zoom/1.2);
    if(a==='fit')return fit(root);
    if(a==='locate'){const r=currentRegion();if(r){selectRegion(root,r.id,false);centerRegion(root,r,true)}return}
    if(a==='explore'){const loc=b.dataset.location;if(loc!==currentLocation()){try{MM_HOST.toastr?.warning?.('只能探索角色当前所在地点')}catch{}return}const api=MM_HOST.MuchiExplore;if(!api?.open){try{MM_HOST.toastr?.warning?.('现场探索引擎尚未加载')}catch{}return}closeMap();setTimeout(()=>api.open({location:loc}),40);return}
  });
  const vp=viewport(root);
  if(!vp)throw Error('地图视口创建失败');
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
  vp.addEventListener('pointerup',end);vp.addEventListener('pointercancel',end);vp.addEventListener('lostpointercapture',()=>{drag=null;vp.classList.remove('dragging')});
  /* v2.9.0: mobile one-finger pan + two-finger pinch zoom. */
  const touchStart=e=>{
    if(e.pointerType!=='touch')return;
    const onHotspot=!!e.target.closest?.('[data-region]');
    touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{vp.setPointerCapture?.(e.pointerId)}catch{}
    if(touchPoints.size===1 && !onHotspot){
      touchPan={id:e.pointerId,x:e.clientX,y:e.clientY,left:vp.scrollLeft,top:vp.scrollTop,moved:false};
    }else if(touchPoints.size>=2){
      const pts=[...touchPoints.values()].slice(0,2),a=pts[0],b=pts[1];
      touchPan=null;
      touchPinch={dist:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),midX:(a.x+b.x)/2,midY:(a.y+b.y)/2};
    }
    if(!onHotspot||touchPoints.size>=2)e.preventDefault();
  };
  const touchMove=e=>{
    if(e.pointerType!=='touch'||!touchPoints.has(e.pointerId))return;
    touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchPoints.size>=2){
      const pts=[...touchPoints.values()].slice(0,2),a=pts[0],b=pts[1];
      const dist=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
      if(!touchPinch)touchPinch={dist,midX,midY};
      vp.scrollLeft-=midX-touchPinch.midX;vp.scrollTop-=midY-touchPinch.midY;
      const ratio=dist/Math.max(1,touchPinch.dist);
      if(Number.isFinite(ratio)&&Math.abs(ratio-1)>.008)zoomAt(root,zoom*ratio,midX,midY);
      touchPinch={dist,midX,midY};
      e.preventDefault();return;
    }
    if(touchPan&&touchPan.id===e.pointerId){
      const dx=e.clientX-touchPan.x,dy=e.clientY-touchPan.y;
      if(Math.abs(dx)+Math.abs(dy)>4)touchPan.moved=true;
      vp.scrollLeft=touchPan.left-dx;vp.scrollTop=touchPan.top-dy;
      e.preventDefault();
    }
  };
  const touchEnd=e=>{
    if(e.pointerType!=='touch')return;
    touchPoints.delete(e.pointerId);
    if(touchPoints.size<2)touchPinch=null;
    if(touchPoints.size===1){
      const [id,p]=[...touchPoints.entries()][0];
      touchPan={id,x:p.x,y:p.y,left:vp.scrollLeft,top:vp.scrollTop,moved:false};
    }else if(touchPoints.size===0)touchPan=null;
  };
  vp.addEventListener('pointerdown',touchStart,{passive:false});
  vp.addEventListener('pointermove',touchMove,{passive:false});
  vp.addEventListener('pointerup',touchEnd,{passive:false});
  vp.addEventListener('pointercancel',touchEnd,{passive:false});
  const win=root.ownerDocument?.defaultView;
  if(win){
    let resizeTimer=0;
    win.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(getRoot()!==root)return;layoutDesktop(root);fit(root,!isDesktop(root))},80)},{passive:true});
  }
}

export async function openMap(){
  if(opening)return opening;
  opening=(async()=>{
    cleanupStale();
    try{
      /* 先准备所有会导致失败的远程资源，再创建任何全屏 DOM。 */
      await prepareResources();
      statData=await readStat();
      const root=mount();
      layoutDesktop(root);
      const img=root.querySelector('[data-ui="map"]');
      if(!img)throw Error('地图图片容器创建失败');
      img.src=asset(mapData.map.image);
      img.onerror=()=>{
        if(img.dataset.fallback)return;
        img.dataset.fallback='1';
        img.src=asset(mapData.map.image,1);
      };
      const cur=currentRegion();
      selectedId=(!isDesktop(root)&&cur)?cur.id:'';
      render(root);
      if(selectedId)root.classList.add('mm-has-detail');else root.classList.remove('mm-has-detail');
      requestAnimationFrame(()=>{
        const live=getRoot();if(live!==root)return;
        fit(root,!isDesktop(root));if(cur)setTimeout(()=>{if(getRoot()===root)centerRegion(root,cur,false)},30);
      });
      return root;
    }catch(e){
      cleanupStale();
      notifyError(e?.message||String(e));
      return null;
    }finally{opening=null}
  })();
  return opening;
}
export function closeMap(){cleanupStale()}
export async function refreshMap(){mapData=null;cssText='';statData=await readStat();return openMap()}

function installApi(){
  const api={open:openMap,close:closeMap,refresh:refreshMap,version:'2.9.0'};
  try{MM_HOST.MuchiMap=api}catch{}
  try{window.MuchiMap=api}catch{}
  return api;
}
function bindDocument(){
  try{
    const key='__muchiMapBridgeV242';
    if(MM_DOC[key])return;MM_DOC[key]=true;
    MM_DOC.addEventListener('click',e=>{
      const b=e.target?.closest?.('[data-muchi-map-open="1"]');if(!b)return;
      e.preventDefault();e.stopPropagation();openMap();
    },true);
  }catch(_){}
}
function install(){
  installApi();bindDocument();
  try{MM_HOST.__muchiMapExploreSyncStop?.stop?.()}catch{}
  try{MM_HOST.__muchiMapExploreSyncStop=globalThis.eventOn?.('muchi:explore-updated',async()=>{statData=await readStat();const root=getRoot();if(root)render(root)})}catch{}
  if(bound)return;bound=true;
  /* 脚本库按钮不在远程模块里注册：getButtonEvent 是脚本专属 API，
   * v25.8 角色卡脚本本体会按官方文档完成按钮绑定。 */
  try{if(typeof globalThis.eventOn==='function')globalThis.eventOn('muchi:open-map',openMap)}catch(_){}
}
install();
export const VERSION='2.9.0';
