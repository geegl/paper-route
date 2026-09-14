// ============ 全局配置 ============
// 所有可调参数集中在这里，方便调手感。

export const CFG = {
  // 道路
  ROAD_HALF: 4,          // 车行道半宽（米）
  SIDEWALK_W: 2,         // 人行道宽
  RIDE_X_LIMIT: 8.2,     // 骑车允许的横向范围（可以骑上人行道，原作特色）

  // 街区
  HOUSE_SPACING: 12,     // 房屋间距（沿街）
  LOT_X: 11.5,           // 房屋中心离路中线距离
  CURB_MAIL_X: 6.6,      // 邮箱离路中线距离

  // 玩家
  SPEED_BASE: 9,         // 自动蹬车速度 m/s
  SPEED_BOOST: 13,       // 按住加速
  SPEED_BRAKE: 4.5,      // 刹车
  ACCEL: 8,              // 加速度
  STEER_SPEED: 7.5,      // 横移速度上限 m/s
  STEER_ACCEL: 26,       // 横移加速度（雨天打折）
  GRAVITY: 22,           // 报纸/跳跃重力（游戏化偏大）

  // 投掷
  THROW_MIN_T: 0.42,     // 最短飞行时间
  THROW_MAX_T: 1.15,
  THROW_SPEED: 17,       // 用于估算飞行时间
  AIM_SNAP: 2.2,         // 鼠标瞄准吸附半径
  SMASH_RANGE: 16,

  // 生命数值
  LIVES: 3,
  START_SUBS: 10,        // 初始订户
  CRASH_TIME: 1.6,       // 摔倒动画时长
  INVULN_TIME: 2.6,      // 摔倒后无敌时间
  DELIVERY_SCORE: 100,   // 单次妥投
  STREAK_MAX: 5,         // 连击倍率上限 ×5
  MISCHIEF_SCORE: 150,   // 砸非订户窗户（恶作剧）
  PERFECT_BONUS: 2500,   // 完美清晨奖励
  PERFECT_SUB_BONUS: 1,  // 完美清晨新增订户
  MAX_SUBSCRIBERS: 16,

  // 狗
  DOG_SPOT_DIST: 30,     // 30 米外发现你
  DOG_SPEED: 10.6,       // 略高于自动蹬车，加速可甩开
  DOG_DISTRACT: 5.5,     // 被报纸吸引的秒数
  DOG_CATCH_DIST: 1.15,

  // 汽车
  CAR_SPEED_MIN: 11,
  CAR_SPEED_MAX: 17,

  // 滑板加时赛
  SKATE_TIME: 60,        // 秒
  SKATE_STAR_SCORE: 100,
  SKATE_AIR_BONUS: 300,
};

// ============ 七天路线配置 ============
// traffic: 车流密度 0~1.2（周五晚高峰），weather 见 weather.js
export const WEEK = [
  { day: 1, name: '星期一', houses: 24, subscribers: 10, traffic: 0.35, dogs: 1, potholes: 2, kids: 0, weather: 'sunny',  tip: '安静的周一清晨，旗子竖起来的信箱就是订户。' },
  { day: 2, name: '星期二', houses: 28, subscribers: 11, traffic: 0.5,  dogs: 2, potholes: 3, kids: 0, weather: 'sunny',  tip: '注意路边打盹的狗——别靠太近。' },
  { day: 3, name: '星期三', houses: 30, subscribers: 12, traffic: 0.65, dogs: 2, potholes: 4, kids: 1, weather: 'sunny',  tip: '路上开始有车了，留意对向车道。' },
  { day: 4, name: '星期四', houses: 32, subscribers: 12, traffic: 0.8,  dogs: 3, potholes: 4, kids: 1, weather: 'sunny',  tip: '熊孩子出没，过马路前看一眼雷达。' },
  { day: 5, name: '星期五', houses: 36, subscribers: 13, traffic: 1.15, dogs: 3, potholes: 5, kids: 2, weather: 'sunset', tip: '晚高峰！车流是平日的两倍，稳住。' },
  { day: 6, name: '星期六', houses: 38, subscribers: 14, traffic: 0.75, dogs: 4, potholes: 5, kids: 3, weather: 'sunny',  tip: '周末的狗格外有精神，被追就甩一份报纸。' },
  { day: 7, name: '星期日', houses: 40, subscribers: 15, traffic: 0.9,  dogs: 5, potholes: 6, kids: 3, weather: 'rain',   tip: '雨天路滑，转向变迟钝，刹车距离变长。' },
];

// ============ 夏日配色 ============
export const PALETTE = {
  skyDay: 0x9ad4ea,
  skySunset: 0xf7b98a,
  skyRain: 0x9aa7b0,
  fogDay: 0xbfe0ec,
  fogSunset: 0xf5cf9f,
  fogRain: 0xa8b2b8,
  grass: 0x7fb46a,
  grassDark: 0x6ba25a,
  road: 0x5c5e63,
  sidewalk: 0xb9b3a6,
  driveway: 0xa39a89,
  dash: 0xf3efe4,
  trunk: 0x7a5b40,
  leafs: [0x5d9c52, 0x6fae5a, 0x86b45f, 0x4f8f4a],
  houseBodies: [0xf2e3c9, 0xe9d6b0, 0xcfe0d4, 0xf0d9d0, 0xd8e2ec, 0xefe0d6, 0xe3ecd9, 0xf5e7d0],
  roofs: [0x8a5a44, 0x6e6a63, 0x9a7048, 0x5f6e63, 0x7d5648],
  doors: [0x8a4a3a, 0x3f6f6a, 0x5a6b8a, 0x9a6a4a],
  carBodies: [0xd9453a, 0x3a6ea5, 0xe0b34c, 0x6aab7c, 0xcfd3d6, 0x8a6ea5],
  dogFurs: [0xa5764a, 0xd8c49a, 0x6e5641, 0xf0ede6],
  riderShirt: 0xd9453a,
  riderPants: 0x3a5a8a,
  flagUp: 0xd9453a,
  paper: 0xf6f2e8,
};

// 确定性随机（mulberry32），同一天同一局街道完全一致
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
