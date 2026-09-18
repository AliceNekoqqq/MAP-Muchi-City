async function importMuchiMap(){
  const urls=[
    'https://cdn.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@v2.4.0/Maps/index.js',
    'https://testingcf.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@v2.4.0/Maps/index.js',
    'https://fastly.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@v2.4.0/Maps/index.js'
  ];
  const errors=[];
  for(const url of urls){
    try{
      const mod=await import(url);
      if(typeof mod?.openMap==='function')return mod;
      errors.push(`${url} -> 导出不匹配: ${Object.keys(mod||{}).join(',')||'无导出'}`);
    }catch(e){errors.push(`${url} -> ${e?.message||e}`)}
  }
  throw new Error('暮迟地图模块加载失败；请确认 GitHub 已创建 v2.4.0 标签并指向当前 main。'+errors.join(' | '));
}
const muchiMap=await importMuchiMap();
$(()=>eventOn(getButtonEvent('暮迟地图'),async()=>{try{await muchiMap.openMap()}catch(e){console.error('[暮迟地图按钮]',e);globalThis.toastr?.error?.(`地图打开失败：${e?.message||e}`)}}));
