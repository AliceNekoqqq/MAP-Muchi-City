export const VERSION='1.0.7';

export const channels={
  global:{label:'全球',short:'INTL',band:'SW',freq:'9.650',delay:'2至7天',scope:'全球感染、跨国交通通信、国际医疗、人道援助。不得出现暮迟市街区级即时信息。'},
  china:{label:'中国',short:'CN',band:'SW',freq:'7.210',delay:'6至36小时',scope:'跨区域避难、交通、电网、公共卫生、救援与公开医疗进展。'},
  muchi:{label:'暮迟市',short:'MUCHI',band:'FM',freq:'88.7',delay:'数分钟至12小时',scope:'暮迟市道路桥梁、尸群迁移、供水供电、天气、通信、避难点与普通幸存者信息。'}
};

const KEY='muchi_radio_v3';
const defaults={
  settings:{
    mode:'main',proxyPreset:'',apiUrl:'',apiKey:'',rememberKey:false,model:'',source:'openai',temperature:.72,maxTokens:720,
    auto:true,hours:6,dateRefresh:true,locationRefresh:true,initialBroadcast:true,autoChannel:'context',
    historyLimit:60,syncMvu:true,injectStory:true,applyEvents:true,syncClues:true,
    civilian:28,tension:'balanced',repeatGuard:true,extra:'',sound:true,static:32,scale:100,inline:true,showIdle:false
  },
  state:{
    channel:'muchi',power:true,mute:false,light:true,hold:false,volume:48,
    lastStamp:'',lastLocation:'',rotate:0,pendingStoryId:'',displayMessageId:'',displayBroadcastId:''
  },
  history:[]
};

export const store=structuredClone(defaults);
let sessionKey='',busy=false,render=()=>{},audio=null;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,Number(n)||0));
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).filter(Boolean).map(String))];
export const isBusy=()=>busy;
export const setRenderer=fn=>{render=typeof fn==='function'?fn:()=>{}};
export const getApiKey=()=>sessionKey||(store.settings.rememberKey?store.settings.apiKey:'');
export const setApiKey=v=>{sessionKey=String(v||'')};

export function load(){
  try{
    const root=getVariables?.({type:'script'})||{};
    const v=root[KEY]||root.muchi_radio_v2;
    if(v){
      store.settings={...defaults.settings,...(v.settings||{})};
      store.state={...defaults.state,...(v.state||{})};
      store.history=Array.isArray(v.history)?v.history:[];
    }
    if(store.settings.rememberKey)sessionKey=store.settings.apiKey||'';
  }catch(e){console.warn('[MR-87] load',e)}
}

export function save(){
  try{
    const copy=structuredClone(store);
    copy.settings.apiKey=copy.settings.rememberKey?(sessionKey||copy.settings.apiKey||''):'';
    copy.history=copy.history.slice(0,clamp(copy.settings.historyLimit,10,200));
    updateVariablesWith?.(v=>{v[KEY]=copy;return v},{type:'script'});
  }catch(e){console.warn('[MR-87] save',e)}
}

const AREA={
  '地下安全屋':'河西旧城边缘','暮迟一中':'西北学区','雁回住宅区':'西北住宅片区','槐安公寓':'雁回住宅片区',
  '河西体育中心':'河西西部','瑞康药房':'河西中部','锦河商圈':'河西中心','河西旧街':'河西旧城区',
  '河西社区医院':'河西南部医疗片区','南桥检查点':'暮江南桥','南郊工业区':'暮江东南工业带'
};

function splitTime(s){
  const t=String(s||'2024-10-27 19:42');
  const m=t.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
  return m?{full:`${m[1]} ${m[2]}`,date:m[1],time:m[2]}:{full:t,date:t.slice(0,10),time:t.slice(11,16)||'00:00'};
}

function formatWeather(w){
  if(!w||typeof w!=='object')return String(w||'未知');
  const a=[];
  if(w.类型)a.push(String(w.类型));
  if(Number.isFinite(Number(w.环境温度)))a.push(`${Number(w.环境温度)}℃`);
  if(w.能见度)a.push(`能见度${w.能见度}`);
  const fx=Array.isArray(w.环境影响)?w.环境影响.filter(Boolean):[];
  if(fx.length)a.push(fx.join('、'));
  return a.join('，')||'未知';
}

function latestAssistantMessageId(){
  try{const chat=globalThis.SillyTavern?.chat||[];for(let i=chat.length-1;i>=0;i--)if(chat[i]&&!chat[i].is_user)return i}catch{}
  return -1;
}

export async function world(){
  try{await waitGlobalInitialized('Mvu')}catch{}
  let v={};
  try{v=getAllVariables()||{}}catch{}
  const d=v.stat_data||v||{},w=d.世界||{},r=d.广播||{},map=d.地图?.地点动态||{},q=d.支线||{};
  const tm=splitTime(w.当前时间);
  const location=String(w.当前地点||'地下安全屋');
  const loc=map[location]||{};
  const mapDigest=Object.entries(map).map(([name,x])=>{
    const tags=Array.isArray(x?.动态标签)&&x.动态标签.length?`，标签${x.动态标签.join('、')}`:'';
    return `${name}：物资${Number(x?.资源指数??50)}/100，尸群${Number(x?.尸群指数??50)}/100，${x?.通行状态||'谨慎通行'}${tags}`;
  }).join('\n');
  const questDigest=['林安安','陆斯年'].map(name=>{
    const s=q[name]||{};
    const clues=Array.isArray(s.已获得线索)?s.已获得线索.length:0;
    return `${name}：${s.状态||'失联'}，已知线索${clues}条，推测区域${s.推测区域||'未知'}，位置确认${s.位置已确认?'是':'否'}`;
  }).join('；');
  return{
    date:tm.date,time:tm.time,stamp:tm.full,day:Number(w.灾变日||1),location,area:AREA[location]||'暮迟市',
    crowd:Number(loc.尸群指数??25),resource:Number(loc.资源指数??50),passage:String(loc.通行状态||'谨慎通行'),
    weather:formatWeather(w.天气),cureStatus:String(w.解药?.状态||'研发中'),cureAt:String(w.解药?.研发完成时间||'2026-04-27 19:42'),
    cureLeft:`${Number(w.解药?.剩余天数??547)}天${Number(w.解药?.剩余小时??0)}小时`,signal:String(r.信号状态||'一般'),
    mapDigest,questDigest,raw:d
  };
}

const stamp=w=>w.stamp||`${w.date} ${w.time}`;
function hours(a,b){
  const p=s=>{const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]):null};
  const x=p(a),y=p(b);return x===null||y===null?0:Math.max(0,(y-x)/36e5);
}
const recent=k=>store.history.filter(x=>x.channel===k).slice(0,7).map(x=>`- [${x.eventTime}] ${x.source}: ${x.summary}`).join('\n')||'暂无。';
function tone(){return store.settings.tension==='calm'?'偏生活化克制，重大消息很少。':store.settings.tension==='tense'?'可以更紧张，但仍必须具体、有限、可信。':'保持真实公共广播节奏：大多数消息普通具体，偶尔出现重要变化。'}

function systemPrompt(){return `你是虚构末世世界“暮迟之昼”的公共无线电广播生成器。
世界时间起点为2024-10-27 19:42；稳定解药的世界事件节点固定为2026-04-27 19:42，整整一年半后。这个完成时间只是生成约束，广播中的公众和机构不能预知这个精确未来日期；完成日前不得宣布“稳定解药已经研发完成”，完成后也不能让社会瞬间恢复。
沈挽昼与{{user}}只是普通幸存者，不是关键样本、救世主或病毒源。广播不知道沈挽昼的特殊感染，不知道{{user}}的实时位置，也不知道楚泽的私人秘密、日记内容或其暗中行为。不得以广播形式揭露楚泽暗线。
E-P病毒原本属于正规的生物医学研究；公共频道只能报道公开层面的研究、事故、医疗和救援信息，不能凭空把研究机构写成邪恶组织。
暮迟市地理：主体城区位于暮江西岸；南桥是当前最重要的跨江通道；南郊工业区位于东南岸。河西旧城、锦河商圈、医院、住宅/学区应遵循实际路网关系。普通尸群跨江优先受南桥通行状态影响。
广播必须像公共信息，不得给主角发布专属任务。允许滞后、重复、误传、信号中断、失效信息；天气、道路、供水供电、通信和普通幸存者消息应占相当比例。
失散同伴线索只能作为低频、模糊的冗余线索出现：可以说“年轻女性急救者”“学生频道”“体育生模样幸存者”等，不得直接宣布林安安或陆斯年的最终藏身房间，也不得靠一条广播直接完成位置确认。
只有暮迟市频道在确有根据时可以附带轻量世界事件；一次最多影响3个已有地点。全球/中国频道原则上不直接修改暮迟市地点数值。
不要提AI、变量、世界书、脚本、SillyTavern或游戏机制。`;}

function userPrompt(k,w){
  const c=channels[k];
  const localExtra=k==='muchi'?`\n暮迟市当前态势（仅供生成保持一致，不代表电台知道玩家所在位置）：\n${w.mapDigest}\n失散同伴调查状态（只用于避免过度泄露）：${w.questDigest}`:'';
  return `生成一条便携式收音机刚刚接收到的公共广播。
当前世界时间：${stamp(w)}；灾变第${w.day}日。玩家当前处于${w.location}/${w.area}，该信息只用于避免叙事矛盾，广播不得表现为知道玩家位置。
当地天气：${w.weather}。当前地点尸群${w.crowd}/100，物资${w.resource}/100，通行${w.passage}。
频道：${c.label} ${c.band} ${c.freq}；典型信息延迟${c.delay}；频道范围：${c.scope}
解药公共状态：${w.cureStatus}。固定完成节点不可被行动提前或延后，也不可作为广播预言。
风格：${tone()} 民间/未经证实信息倾向约${store.settings.civilian}%。
摘要30-90字；听写正文70-220字；可少量静电断句。事件时间不得晚于当前世界时间。
如果是普通消息，world_event.triggered=false。只有会实际改变暮迟市既有地点态势的本地重要消息才给出world_event；数值变化应克制，一次最多3地。
side_clue通常为“无”；只有消息自然构成失散同伴的模糊冗余线索时才填写，且不能直接确认最终位置。
近期内容，避免机械重复：\n${store.settings.repeatGuard?recent(k):'无需重复保护。'}${localExtra}
附加偏好：${store.settings.extra||'无'}
只输出一个JSON对象，不要代码块、不要前后说明、不要思维过程。字段必须完整；如果无法提供world_event或side_clue，也必须按结构返回triggered=false与target="无"。`;
}

const schema={name:'muchi_radio_v3',strict:true,value:{type:'object',properties:{
  event_time:{type:'string'},source:{type:'string'},signal:{type:'string',enum:['强','一般','微弱','断续']},category:{type:'string'},headline:{type:'string'},summary:{type:'string'},transcript:{type:'string'},certainty:{type:'string'},
  world_event:{type:'object',properties:{triggered:{type:'boolean'},event_type:{type:'string',enum:['无','尸群迁徙','道路变化','救援活动','公共设施','通信异常','火灾爆炸','天气影响','其他']},summary:{type:'string'},locations:{type:'array',maxItems:3,items:{type:'object',properties:{name:{type:'string'},crowd_delta:{type:'integer'},resource_delta:{type:'integer'},passage:{type:'string',enum:['不变','可通行','谨慎通行','受阻','封锁']},add_tags:{type:'array',items:{type:'string'}},remove_tags:{type:'array',items:{type:'string'}}},required:['name','crowd_delta','resource_delta','passage','add_tags','remove_tags'],additionalProperties:false}}},required:['triggered','event_type','summary','locations'],additionalProperties:false},
  side_clue:{type:'object',properties:{target:{type:'string',enum:['无','林安安','陆斯年']},name:{type:'string'},summary:{type:'string'},strength:{type:'string',enum:['无','弱','中','强']},region_hint:{type:'string'}},required:['target','name','summary','strength','region_hint'],additionalProperties:false}
},required:['event_time','source','signal','category','headline','summary','transcript','certainty','world_event','side_clue'],additionalProperties:false}};

function config(k,w){
  const s=store.settings,c={user_input:userPrompt(k,w),ordered_prompts:[{role:'system',content:systemPrompt()},{role:'user',content:userPrompt(k,w)}],should_silence:true,json_schema:schema,generation_id:`muchi-radio-${Date.now()}`};
  const sampling={temperature:clamp(s.temperature,0,2),max_tokens:clamp(s.maxTokens,256,1600)};
  if(s.mode==='proxy')c.custom_api={proxy_preset:s.proxyPreset,model:s.model||undefined,...sampling};
  else if(s.mode==='custom')c.custom_api={apiurl:s.apiUrl,key:getApiKey(),model:s.model,source:s.source||'openai',...sampling};
  else c.custom_api={...sampling};
  return c;
}

function responseText(x){
  if(typeof x==='string')return x;
  if(x&&typeof x.content==='string')return x.content;
  try{return JSON.stringify(x??'')}catch{return String(x??'')}
}
function balancedObjects(text){
  const out=[];let start=-1,depth=0,quote='',escape=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(start<0){if(c==='{'){start=i;depth=1}continue}
    if(quote){if(escape){escape=false;continue}if(c==='\\'){escape=true;continue}if(c===quote)quote='';continue}
    if(c==='"'||c==="'"){quote=c;continue}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0){out.push(text.slice(start,i+1));start=-1}
  }
  return out;
}
function parseJsonCandidate(text){
  const raw=String(text||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  const fenced=[...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(x=>x[1].trim());
  const clean=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const candidates=[clean,...fenced,...balancedObjects(clean)].filter(Boolean).reverse();
  for(const candidate of candidates){
    try{return JSON.parse(candidate)}catch{}
    try{return JSON.parse(candidate.replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/,\s*([}\]])/g,'$1'))}catch{}
  }
  return null;
}
function fallbackBroadcast(text,k,w){
  const plain=String(text||'').replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/```[a-z]*|```/gi,'').trim();
  if(!plain)throw Error('模型没有返回可用内容');
  const oneLine=plain.replace(/\s+/g,' ').trim();
  const first=(oneLine.match(/^.{1,36}?[。！？!?]/)?.[0]||oneLine.slice(0,32)||'广播更新').trim();
  return{
    event_time:stamp(w),source:`${channels[k].label}公共广播`,signal:'一般',category:'广播',headline:first.replace(/[。！？!?]+$/,''),
    summary:oneLine.slice(0,90),transcript:plain.slice(0,900),certainty:'未结构化播报',
    world_event:{triggered:false,event_type:'无',summary:'',locations:[]},
    side_clue:{target:'无',name:'',summary:'',strength:'无',region_hint:''}
  };
}
function parse(x,k,w){
  const text=responseText(x),parsed=parseJsonCandidate(text);
  if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed;
  console.warn('[MR-87] 模型未按JSON返回，已降级为普通广播文本',text);
  return fallbackBroadcast(text,k,w);
}

function normalizeWorldEvent(raw,k){
  const e=raw&&typeof raw==='object'?raw:{};
  if(k!=='muchi'||!e.triggered)return{triggered:false,eventType:'无',summary:'',locations:[]};
  const locations=(Array.isArray(e.locations)?e.locations:[]).slice(0,3).map(x=>({
    name:String(x?.name||''),crowdDelta:clamp(Math.round(Number(x?.crowd_delta)||0),-20,20),resourceDelta:clamp(Math.round(Number(x?.resource_delta)||0),-15,15),
    passage:['可通行','谨慎通行','受阻','封锁'].includes(x?.passage)?x.passage:'不变',addTags:uniq(x?.add_tags).slice(0,3),removeTags:uniq(x?.remove_tags).slice(0,3)
  })).filter(x=>x.name);
  return{triggered:locations.length>0,eventType:String(e.event_type||'其他'),summary:String(e.summary||''),locations};
}

function normalizeClue(raw,k){
  const c=raw&&typeof raw==='object'?raw:{};
  if(k!=='muchi'||!['林安安','陆斯年'].includes(c.target))return{target:'无',name:'',summary:'',strength:'无',regionHint:''};
  return{target:c.target,name:String(c.name||'广播中的模糊线索'),summary:String(c.summary||''),strength:['弱','中','强'].includes(c.strength)?c.strength:'弱',regionHint:String(c.region_hint||'')};
}

async function syncMvu(x){
  if(!store.settings.syncMvu&&!store.settings.applyEvents&&!store.settings.syncClues)return x;
  let applied=[];let clueApplied='';
  try{
    updateVariablesWith?.(v=>{
      const d=v.stat_data||(v.stat_data={});
      if(store.settings.syncMvu){
        const r=d.广播||(d.广播={}),label=channels[x.channel].label;
        r.当前频道=label;r.信号状态=x.signal;r.上次刷新时间=x.worldStamp;
        const sec=r[label]||(r[label]={});sec.事件时间=x.eventTime;sec.来源=x.source;sec.摘要=x.summary;
      }
      if(store.settings.applyEvents&&x.channel==='muchi'&&x.worldEvent?.triggered){
        const map=d.地图?.地点动态||{};
        for(const eff of x.worldEvent.locations.slice(0,3)){
          const loc=map[eff.name];if(!loc)continue;
          const beforeC=Number(loc.尸群指数??50),beforeR=Number(loc.资源指数??50);
          loc.尸群指数=clamp(beforeC+eff.crowdDelta,0,100);
          loc.资源指数=clamp(beforeR+eff.resourceDelta,0,100);
          if(eff.passage!=='不变')loc.通行状态=eff.passage;
          let tags=uniq(loc.动态标签);
          tags=tags.filter(t=>!eff.removeTags.includes(t));
          tags=uniq([...tags,...eff.addTags]).slice(0,8);loc.动态标签=tags;loc.最后更新时间=x.worldStamp;
          const changes=[];
          if(eff.crowdDelta)changes.push(`尸群${eff.crowdDelta>0?'+':''}${eff.crowdDelta}`);
          if(eff.resourceDelta)changes.push(`物资${eff.resourceDelta>0?'+':''}${eff.resourceDelta}`);
          if(eff.passage!=='不变')changes.push(`通行→${eff.passage}`);
          if(changes.length)applied.push(`${eff.name} ${changes.join(' / ')}`);
        }
      }
      if(store.settings.syncClues&&x.channel==='muchi'&&x.sideClue?.target!=='无'){
        const q=d.支线?.[x.sideClue.target];
        if(q&&!q.位置已确认){
          const clues=Array.isArray(q.已获得线索)?q.已获得线索:[];
          if(!clues.includes(x.sideClue.name)){
            q.已获得线索=[...clues,x.sideClue.name];
            q.最近线索=x.sideClue.summary||x.sideClue.name;
            if(q.状态==='失联')q.状态='发现踪迹';
            if(x.sideClue.regionHint&&q.推测区域==='未知')q.推测区域=x.sideClue.regionHint;
            if(x.sideClue.strength==='强'&&q.已获得线索.length>=3&&q.状态==='发现踪迹')q.状态='锁定区域';
            clueApplied=`${x.sideClue.target}：${x.sideClue.name}`;
          }
        }
      }
      if(store.settings.syncMvu){
        const r=d.广播||(d.广播={});
        r.最近事件=applied.length?(x.worldEvent.summary||applied.join('；')):'无';
      }
      return v;
    },{type:'message',message_id:latestAssistantMessageId()});
  }catch(e){console.warn('[MR-87] MVU sync',e)}
  x.appliedImpact=applied;
  x.appliedClue=clueApplied;
  return x;
}

export async function generate(k=store.state.channel,reason='manual'){
  if(busy)return null;
  busy=true;render('busy',true);noise(.28);
  try{
    const w=await world(),raw=parse(await generateRaw(config(k,w)),k,w);
    const x={
      id:`r${Date.now()}`,channel:k,eventTime:String(raw.event_time||stamp(w)),source:String(raw.source||channels[k].label),
      signal:['强','一般','微弱','断续'].includes(raw.signal)?raw.signal:'一般',category:String(raw.category||'其他'),
      headline:String(raw.headline||'广播更新'),summary:String(raw.summary||raw.transcript||''),transcript:String(raw.transcript||raw.summary||''),
      certainty:String(raw.certainty||'公开信息'),worldStamp:stamp(w),location:w.location,
      worldEvent:normalizeWorldEvent(raw.world_event,k),sideClue:normalizeClue(raw.side_clue,k),reason
    };
    await syncMvu(x);
    store.history.unshift(x);store.history=store.history.slice(0,clamp(store.settings.historyLimit,10,200));
    store.state.channel=k;store.state.lastStamp=x.worldStamp;store.state.lastLocation=w.location;store.state.pendingStoryId=x.id;
    save();render('all');
    if(reason==='manual')toastr?.success?.(`收到新的${channels[k].label}广播`);
    return x;
  }catch(e){
    console.error('[MR-87]',e);render('error',e?.message||String(e));toastr?.error?.(`收音机生成失败：${e?.message||e}`);return null;
  }finally{busy=false;render('busy',false)}
}

function autoReason(w){
  if(!store.settings.auto)return'';
  if(store.settings.initialBroadcast&&!store.history.length)return'initial';
  const prev=store.state.lastStamp;
  if(!prev)return'initial';
  if(store.settings.dateRefresh&&prev.slice(0,10)!==stamp(w).slice(0,10))return'date';
  if(store.settings.locationRefresh&&store.state.lastLocation&&store.state.lastLocation!==w.location)return'location';
  if(hours(prev,stamp(w))>=clamp(store.settings.hours,1,48))return'time';
  return'';
}

function channelFor(reason,w){
  let k=store.state.channel;
  if(store.settings.autoChannel==='context'){
    if(reason==='initial'||reason==='location')k='muchi';
    else if(reason==='date')k=w.day<=14?'china':'global';
  }else if(store.settings.autoChannel==='rotate'){
    const a=['muchi','china','global'];store.state.rotate=(store.state.rotate+1)%a.length;k=a[store.state.rotate];
  }
  return k;
}

function injectStoryBroadcast(x){
  if(!x||!store.settings.injectStory||typeof injectPrompts!=='function')return;
  const changes=x.appliedImpact?.length?`\n这条广播已经造成可观测的城市态势变化：${x.appliedImpact.join('；')}。`:'';
  const clue=x.appliedClue?`\n广播同时构成一条模糊的失散同伴线索：${x.appliedClue}。只能自然感知，不要把它写成任务提示。`:'';
  const content=`【刚刚从MR-87收音机听到的公共广播】\n频道：${channels[x.channel].label}；事件时间：${x.eventTime}\n${x.headline}\n${x.summary}${changes}${clue}\n本轮正文中的人物可以把它视为刚刚听到的信息。只在自然相关时作出反应，不要全文复述广播，不要把它变成系统任务，也不要声称电台知道主角实时位置。`;
  try{uninjectPrompts?.(['muchi-radio-current'])}catch{}
  try{injectPrompts([{id:'muchi-radio-current',position:'in_chat',depth:0,role:'system',content,should_scan:true}],{once:true})}catch(e){console.warn('[MR-87] inject',e)}
}

export async function prepareBeforeGeneration(){
  if(busy)return null;
  let pending=store.state.pendingStoryId?byId(store.state.pendingStoryId):null;
  if(pending){injectStoryBroadcast(pending);return pending;}
  const w=await world(),why=autoReason(w);
  if(!why)return null;
  const x=await generate(channelFor(why,w),`auto:${why}`);
  if(x)injectStoryBroadcast(x);
  return x;
}

export function markStoryMessage(messageId){
  if(!store.state.pendingStoryId)return null;
  const x=byId(store.state.pendingStoryId);if(!x)return null;
  store.state.displayMessageId=String(messageId);
  store.state.displayBroadcastId=x.id;
  store.state.pendingStoryId='';
  save();return x;
}

export function displayForMessage(messageId){
  if(String(messageId)!==String(store.state.displayMessageId))return null;
  return byId(store.state.displayBroadcastId);
}

export async function autoRefresh(){
  const w=await world(),why=autoReason(w);if(!why||busy)return null;
  return generate(channelFor(why,w),`auto:${why}`);
}

export const latest=k=>store.history.find(x=>x.channel===k);
export const byId=id=>store.history.find(x=>x.id===id);
export function switchChannel(k){if(!channels[k]||!store.state.power)return;store.state.channel=k;noise(.1);clickSound();save();render('radio')}
export function cycle(d){const a=['global','china','muchi'],i=a.indexOf(store.state.channel);switchChannel(a[(i+d+a.length)%a.length])}
export function clearHistory(){store.history=[];store.state.pendingStoryId='';store.state.displayBroadcastId='';store.state.displayMessageId='';save();render('all')}

export function audioCtx(){if(!store.settings.sound||store.state.mute)return null;try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;audio ||= new A();if(audio.state==='suspended')audio.resume();return audio}catch{return null}}
export function clickSound(){const a=audioCtx();if(!a)return;const o=a.createOscillator(),g=a.createGain();o.type='square';o.frequency.value=165;g.gain.value=(store.state.volume/100)*.025;o.connect(g).connect(a.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.035);o.stop(a.currentTime+.04)}
export function noise(sec=.15){const a=audioCtx();if(!a)return;const n=Math.floor(a.sampleRate*sec),b=a.createBuffer(1,n,a.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();f.type='bandpass';f.frequency.value=1800;g.gain.value=(store.state.volume/100)*(store.settings.static/100)*.18;s.buffer=b;s.connect(f).connect(g).connect(a.destination);s.start()}

export async function testConnection(){const w=await world(),c=config(store.state.channel,w);c.user_input='只返回 RADIO_OK';c.ordered_prompts=[{role:'user',content:'只返回 RADIO_OK'}];delete c.json_schema;const x=await generateRaw(c),t=typeof x==='string'?x:(x?.content||'');if(!String(t).includes('RADIO_OK'))throw Error(String(t).slice(0,80));return true}

export async function initCore(){
  load();
  const w=await world();
  if(!store.state.lastLocation)store.state.lastLocation=w.location;
  if(store.history.length&&!store.state.lastStamp)store.state.lastStamp=store.history[0]?.worldStamp||stamp(w);
  save();
}
