# MAP-Muchi-City

暮迟市外置互动地图。用于 SillyTavern + TavernHelper。

## 仓库结构

```text
MAP-Muchi-City/
├─ Map/
│  ├─ index.js       # 酒馆助手地图脚本
│  ├─ style.css      # 地图界面样式
│  └─ map-data.json  # 坐标、路线、地点资料
├─ Assets/
│  └─ 暮迟市地图.png
└─ Locations/
   └─ 各地点场景图.png
```

## 角色卡加载方式

角色卡里的 TavernHelper 脚本使用：

```js
const url = 'https://testingcf.jsdelivr.net/gh/AliceNekoqqq/MAP-Muchi-City@main/Map/index.js';
await import(`${url}?v=${Date.now()}`);
```

地图内部每次打开都会通过 `raw.githubusercontent.com` 重新读取：

- `Map/style.css`
- `Map/map-data.json`
- `Assets/暮迟市地图.png`
- 当前地点场景图

并附带时间戳避免浏览器缓存。因此修改样式、坐标、地图图片、地点图片后，打开地图或点击“刷新资源”即可重新读取；若修改 `index.js` 本身，重新加载角色卡/刷新酒馆页面即可。

## 打开方式

1. TavernHelper 脚本按钮：`暮迟地图`
2. 角色状态栏中的：`地图 ↗`
3. 页面自定义事件：`muchi:open-map`

## 坐标规则

`map-data.json` 中坐标均为百分比：

- 左上角：`0, 0`
- 右下角：`100, 100`
- 基准图片尺寸：`1536 × 1024`

之后只需要改 `map-data.json`，不必重做角色卡。

## 当前地图能力

- 全屏外置地图，不受状态栏宽度限制
- 鼠标滚轮缩放
- 拖拽平移
- 手机双指缩放 / 单指拖动
- 当前地点自动定位与脉冲标记
- 探索地点 / 城区分区 / 路线图层切换
- 地点查找
- 读取 MVU `地图.地点动态` 中的物资指数、尸群指数、通行状态、动态标签
- 地点影像与相邻路线
- GitHub 资源手动即时刷新

> `临江大学城` 是暮迟市内的普通大学城区域，不等同于设定中的栖澜大学。栖澜大学仍位于暮迟市外。
