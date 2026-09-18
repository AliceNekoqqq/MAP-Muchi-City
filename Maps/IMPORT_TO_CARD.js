// TavernHelper / 酒馆助手：将此段作为角色卡脚本即可。
// 每次角色卡重新加载时使用时间戳请求 main 分支最新 index.js。
const MUCHI_MAP_MODULE='https://testingcf.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Map/index.js';
try {
  await import(`${MUCHI_MAP_MODULE}?v=${Date.now()}`);
} catch (e) {
  console.error('[暮迟地图] 远程脚本加载失败', e);
}
