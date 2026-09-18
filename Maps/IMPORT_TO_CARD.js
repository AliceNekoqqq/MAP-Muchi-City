// 可选：单独作为 TavernHelper 脚本导入。
// 正式角色卡 v20 已由“暮迟UI总控”按需加载本模块。
const urls=[
  'https://testingcf.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Map/index.js',
  'https://fastly.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Map/index.js',
  'https://cdn.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Map/index.js',
];
let last;
for(const u of urls){try{await import(`${u}?v=${Date.now()}`);last=null;break}catch(e){last=e}}
if(last)throw last;
