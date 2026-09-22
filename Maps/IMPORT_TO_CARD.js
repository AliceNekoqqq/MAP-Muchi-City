async function importMuchiMap(){
  const urls=[
    'https://cdn.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@v2.8.1/Maps/index.js',
    'https://testingcf.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Maps/index.js?muchi=281',
    'https://fastly.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Maps/index.js?muchi=281'
  ];
  const errors=[];
  for(const url of urls){
    try{
      const mod=await import(url);
      if(typeof mod?.openMap==='function')return mod;
      errors.push(`${url} -> 导出不匹配: ${Object.keys(mod||{}).join(',')||'无导出'}`);
    }catch(e){errors.push(`${url} -> ${e?.message||e}`)}
  }
  throw new Error('暮迟地图模块加载失败；请先将地图 v2.8.1 覆盖文件上传到 GitHub main，并建议创建 v2.8.1 标签。'+errors.join(' | '));
}
const muchiMap=await importMuchiMap();
async function openMuchiMapWithTour(){
  const root=await muchiMap.openMap();
  const host=globalThis.$?.('body')?.[0]?.ownerDocument?.defaultView||window.parent||window;
  setTimeout(()=>host.MuchiTutorial?.start?.('muchi-map',{root:root||host.document.getElementById('muchi-map-root'),title:'暮迟市地图',steps:[
    {target:'.mm-viewport',title:'地图画布',text:'手机上单指拖动、双指缩放；电脑端可以滚轮缩放。地图只展示玩家已经知道的世界信息。'},
    {target:'.mm-hotspot',title:'区域圆点',text:'点击编号圆点查看区域详情。特殊幸存者设施只有真正获得情报后才会出现。'},
    {target:'.mm-controls',title:'缩放与定位',text:'− / ＋ 调整比例，中间百分比可以恢复总览，“定位”会回到当前区域。'},
    {target:'[data-ui="detail"]',title:'区域详情',text:'这里显示风险、物资倾向、已知情报和区域内地点。情报可能过期，不等于后台真实世界状态。'},
    {target:'[data-act="explore"]',title:'进入现场探索',text:'只有角色当前所在地点才会出现探索入口，地图不会让你远程搜刮其它区域。'},
    {target:'.mm-close',title:'关闭地图',text:'关闭不会改变当前位置或推进时间。'}
  ]}),180);
  return root;
}
try{const host=globalThis.$?.('body')?.[0]?.ownerDocument?.defaultView||window.parent||window;if(host.MuchiMap)host.MuchiMap.open=openMuchiMapWithTour}catch(_){ }
$(()=>eventOn(getButtonEvent('暮迟地图'),async()=>{try{await openMuchiMapWithTour()}catch(e){console.error('[暮迟地图按钮]',e);globalThis.toastr?.error?.(`地图打开失败：${e?.message||e}`)}}));

