const canvas = document.getElementById("tank");
const ctx = canvas.getContext("2d", { alpha: false });

const feedBtn = document.getElementById("feedBtn");
const waterBtn = document.getElementById("waterBtn");
const swapBtn = document.getElementById("swapBtn");
const lightBtn = document.getElementById("lightBtn");
const dockBtn = document.getElementById("dockBtn");
const closeBtn = document.getElementById("closeBtn");
const windowTitle = document.getElementById("windowTitle");
const waterBadge = document.getElementById("waterBadge");
const lightBadge = document.getElementById("lightBadge");
const fishBadge = document.getElementById("fishBadge");

const W = canvas.width;
const H = canvas.height;
const bottom = H - 18;
const targetFishCount = 4;
const targetSpeciesCount = 2;
const breedingChance = 0.00125;
const initialBreedingCooldown = [36, 105];
const breedingCooldown = [72, 126];
const desktopMode = new URLSearchParams(window.location.search).get("app") === "1";
const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const flowScratch = { x: 0, y: 0 };
const drawOrder = [];
let simulationTime = performance.now();

const personalityProfiles = [
  { name: "bold", pace: 1.16, appetite: 1.18, boldness: 0.88, sociability: 0.05, curiosity: 0.78, caution: 0.24, roam: 1.2 },
  { name: "calm", pace: 0.86, appetite: 0.92, boldness: 0.45, sociability: 0.12, curiosity: 0.42, caution: 0.56, roam: 0.82 },
  { name: "social", pace: 1.02, appetite: 1.02, boldness: 0.62, sociability: 0.48, curiosity: 0.56, caution: 0.38, roam: 0.96 },
  { name: "shy", pace: 0.78, appetite: 0.86, boldness: 0.22, sociability: -0.18, curiosity: 0.26, caution: 0.84, roam: 0.64 },
  { name: "explorer", pace: 1.08, appetite: 0.98, boldness: 0.68, sociability: -0.04, curiosity: 0.92, caution: 0.34, roam: 1.36 },
  { name: "nibbler", pace: 0.94, appetite: 1.28, boldness: 0.56, sociability: 0.08, curiosity: 0.64, caution: 0.44, roam: 0.9 }
];

function makePersonality(parentA = null, parentB = null) {
  if (parentA && parentB) {
    const mix = (key, spread = 0.08) => clamp((parentA.personality[key] + parentB.personality[key]) / 2 + rand(-spread, spread), 0.12, 1.45);
    return {
      name: Math.random() < 0.5 ? parentA.personality.name : parentB.personality.name,
      pace: mix("pace", 0.1),
      appetite: mix("appetite", 0.1),
      boldness: mix("boldness", 0.12),
      sociability: clamp((parentA.personality.sociability + parentB.personality.sociability) / 2 + rand(-0.12, 0.12), -0.35, 0.6),
      curiosity: mix("curiosity", 0.12),
      caution: mix("caution", 0.12),
      roam: mix("roam", 0.14),
      layerOffset: clamp((parentA.personality.layerOffset + parentB.personality.layerOffset) / 2 + rand(-0.12, 0.12), -0.42, 0.42),
      homeX: clamp((parentA.personality.homeX + parentB.personality.homeX) / 2 + rand(-42, 42), 28, W - 28)
    };
  }

  const base = personalityProfiles[Math.floor(Math.random() * personalityProfiles.length)];
  return {
    name: base.name,
    pace: clamp(base.pace + rand(-0.08, 0.08), 0.68, 1.32),
    appetite: clamp(base.appetite + rand(-0.08, 0.08), 0.72, 1.36),
    boldness: clamp(base.boldness + rand(-0.1, 0.1), 0.1, 1),
    sociability: clamp(base.sociability + rand(-0.1, 0.1), -0.35, 0.6),
    curiosity: clamp(base.curiosity + rand(-0.1, 0.1), 0.1, 1),
    caution: clamp(base.caution + rand(-0.1, 0.1), 0.1, 1),
    roam: clamp(base.roam + rand(-0.12, 0.12), 0.55, 1.5),
    layerOffset: rand(-0.38, 0.38),
    homeX: rand(32, W - 32)
  };
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function rotateTowardAngle(from, to, maxStep) {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}

function waterFlowAt(x, y, time = simulationTime) {
  const layer = y / H;
  const slow = Math.sin(time * 0.00035 + x * 0.015 + layer * 2.4);
  const eddy = Math.sin(time * 0.0008 + y * 0.04) * Math.cos(x * 0.02);
  flowScratch.x = (0.006 + layer * 0.006) * slow + eddy * 0.003;
  flowScratch.y = Math.cos(time * 0.00042 + x * 0.012) * 0.002;
  return flowScratch;
}

function shelterPointFor(f) {
  const towardRock = f.x < W * 0.55 || f.spec.feedStyle === "bottom" || f.spec.feedStyle === "scrape";
  return towardRock
    ? { x: 86 + Math.sin(f.zoneDrift) * 18, y: bottom - 38 + Math.cos(f.zoneDrift) * 8 }
    : { x: 286 + Math.sin(f.zoneDrift) * 22, y: bottom - 52 + Math.cos(f.zoneDrift) * 14 };
}

const species = [
  { name: "孔雀鱼", body: ["#ff715b", "#ffd166", "#59d3c7"], accent: "#69d8ff", stripe: "#fff6d8", size: 10.5, length: 3.05, depth: 0.9, undulation: 1.18, tailSize: 1.55, speed: 0.62, social: 0.42, realMotion: "tail-flick", pattern: "tailSpots", tailShape: "fan", zone: [46, 150] },
  { name: "霓虹灯鱼", body: ["#206bff", "#27f2d4", "#f34d75"], accent: "#f8fbff", stripe: "#19e1ff", size: 7.5, length: 3.55, depth: 0.62, undulation: 0.92, tailSize: 0.72, speed: 0.82, social: 0.82, realMotion: "school", pattern: "neon", tailShape: "fork", zone: [42, 128] },
  { name: "宝莲灯鱼", body: ["#1646c8", "#33eff2", "#df355f"], accent: "#f6ffff", stripe: "#28f0ff", size: 8, length: 3.58, depth: 0.64, undulation: 0.9, tailSize: 0.74, speed: 0.78, social: 0.86, realMotion: "school", pattern: "cardinal", tailShape: "fork", zone: [42, 132] },
  { name: "斗鱼", body: ["#6d32ff", "#df3c94", "#ffbf45"], accent: "#67f4eb", stripe: "#ffe66b", size: 12.5, length: 2.8, depth: 0.98, undulation: 0.58, tailSize: 1.82, speed: 0.38, social: -0.28, realMotion: "hover", pattern: "veil", tailShape: "veil", zone: [48, 145] },
  { name: "神仙鱼", body: ["#d7d0bd", "#f3efe0", "#6b7078"], accent: "#f0d381", stripe: "#1d2328", size: 13, length: 2.25, depth: 1.65, undulation: 0.54, tailSize: 1.0, speed: 0.36, social: 0.18, realMotion: "sail", pattern: "verticalBars", tailShape: "triangle", zone: [38, 145] },
  { name: "七彩神仙鱼", body: ["#2cc4d4", "#f15b7a", "#f2d36b"], accent: "#5cffce", stripe: "#7632b8", size: 14, length: 2.2, depth: 1.8, undulation: 0.44, tailSize: 0.82, speed: 0.32, social: 0.32, realMotion: "disk", pattern: "maze", tailShape: "round", zone: [48, 150] },
  { name: "斑马鱼", body: ["#dfe9d2", "#b9c4a5", "#2a3343"], accent: "#a8d8ff", stripe: "#1b2635", size: 7.5, length: 3.95, depth: 0.58, undulation: 1.18, tailSize: 0.72, speed: 0.96, social: 0.66, realMotion: "burst", pattern: "zebra", tailShape: "fork", zone: [34, 112] },
  { name: "白云金丝鱼", body: ["#b6b7a5", "#f0d25c", "#cf3d42"], accent: "#f7f1c7", stripe: "#e8d865", size: 7, length: 3.65, depth: 0.6, undulation: 1.0, tailSize: 0.76, speed: 0.78, social: 0.72, realMotion: "school", pattern: "goldStripe", tailShape: "fork", zone: [32, 118] },
  { name: "三角灯鱼", body: ["#e39b5c", "#f5c16b", "#25242b"], accent: "#ffdf8c", stripe: "#25242b", size: 8.5, length: 3.2, depth: 0.78, undulation: 0.82, tailSize: 0.78, speed: 0.68, social: 0.78, realMotion: "school", pattern: "wedge", tailShape: "fork", zone: [44, 132] },
  { name: "红鼻剪刀", body: ["#e4e0d4", "#d7d5ce", "#f34a3f"], accent: "#f4f4ee", stripe: "#25252a", size: 8, length: 3.65, depth: 0.6, undulation: 0.96, tailSize: 0.78, speed: 0.82, social: 0.9, realMotion: "school", pattern: "rummy", tailShape: "fork", zone: [48, 138] },
  { name: "黑裙鱼", body: ["#d8d4ca", "#8c8d93", "#32353b"], accent: "#bac2c7", stripe: "#2b2f34", size: 9.5, length: 2.85, depth: 1.05, undulation: 0.72, tailSize: 1.0, speed: 0.55, social: 0.48, realMotion: "glide", pattern: "skirt", tailShape: "skirt", zone: [45, 142] },
  { name: "虎皮鱼", body: ["#f4b55c", "#f1d17c", "#24272d"], accent: "#f47d3d", stripe: "#1f2529", size: 8.8, length: 3.05, depth: 0.9, undulation: 1.0, tailSize: 0.86, speed: 0.78, social: 0.5, realMotion: "burst", pattern: "tigerBars", tailShape: "fork", zone: [48, 135] },
  { name: "樱桃灯", body: ["#a02c35", "#e04e4f", "#ffb36b"], accent: "#f5d19a", stripe: "#60191e", size: 7.5, length: 3.1, depth: 0.78, undulation: 0.86, tailSize: 0.82, speed: 0.6, social: 0.36, realMotion: "glide", pattern: "warmLine", tailShape: "fork", zone: [55, 150] },
  { name: "红剑尾", body: ["#e95c36", "#ff9a4a", "#f6d071"], accent: "#ffe0a2", stripe: "#ba2a2d", size: 10, length: 3.25, depth: 0.72, undulation: 0.9, tailSize: 1.15, speed: 0.62, social: 0.34, realMotion: "tail-flick", pattern: "sword", tailShape: "sword", zone: [48, 150] },
  { name: "月光鱼", body: ["#ff9a47", "#ffc65f", "#f55d4d"], accent: "#f8e5a2", stripe: "#e45c38", size: 9.5, length: 2.85, depth: 0.9, undulation: 0.74, tailSize: 0.9, speed: 0.52, social: 0.42, realMotion: "glide", pattern: "plain", tailShape: "round", zone: [50, 148] },
  { name: "玛丽鱼", body: ["#23272b", "#70766e", "#f0e5c1"], accent: "#ffce76", stripe: "#f7e8b4", size: 10.5, length: 3.05, depth: 0.92, undulation: 0.72, tailSize: 1.0, speed: 0.5, social: 0.34, realMotion: "glide", pattern: "molly", tailShape: "round", zone: [50, 155] },
  { name: "珍珠马甲", body: ["#8e7c68", "#c6a883", "#f0ddbf"], accent: "#f4c366", stripe: "#f5e8ca", size: 11.5, length: 3.05, depth: 1.08, undulation: 0.52, tailSize: 0.92, speed: 0.36, social: 0.22, realMotion: "hover", pattern: "pearl", tailShape: "round", zone: [40, 145] },
  { name: "丽丽鱼", body: ["#e64945", "#38b6c4", "#f7c75f"], accent: "#75f0df", stripe: "#2e87b8", size: 10.5, length: 2.8, depth: 1.0, undulation: 0.5, tailSize: 0.88, speed: 0.34, social: 0.12, realMotion: "hover", pattern: "gouramiBars", tailShape: "round", zone: [40, 145] },
  { name: "拉米雷兹短鲷", body: ["#ffe66d", "#4ecdc4", "#ff6b6b"], accent: "#1a535c", stripe: "#b5179e", size: 10, length: 2.95, depth: 1.02, undulation: 0.92, tailSize: 0.9, speed: 0.54, social: 0.25, realMotion: "graze", pattern: "ram", tailShape: "round", zone: [86, 166] },
  { name: "鼠鱼", body: ["#d6cbb5", "#8c8a78", "#5d625c"], accent: "#f4e6c8", stripe: "#303638", size: 8.5, length: 3.0, depth: 0.82, undulation: 0.72, tailSize: 0.68, speed: 0.44, social: 0.56, realMotion: "bottom", pattern: "pepper", tailShape: "fork", zone: [132, 174] },
  { name: "库利泥鳅", body: ["#ddaa57", "#7a3b25", "#2a1711"], accent: "#e3b66a", stripe: "#3b2117", size: 7, length: 5.1, depth: 0.35, undulation: 1.62, tailSize: 0.46, speed: 0.58, social: 0.4, realMotion: "loach", pattern: "loachBands", tailShape: "tiny", zone: [140, 176] },
  { name: "小精灵鱼", body: ["#d5d6bd", "#727b68", "#353a32"], accent: "#e8dfbc", stripe: "#2b332c", size: 7, length: 3.4, depth: 0.54, undulation: 0.52, tailSize: 0.58, speed: 0.32, social: 0.2, realMotion: "sucker", pattern: "sideStripe", tailShape: "tiny", zone: [118, 174] },
  { name: "黄金大胡子", body: ["#e3c36b", "#d89b3a", "#9d6b30"], accent: "#f6dc91", stripe: "#a57738", size: 11.5, length: 3.2, depth: 0.82, undulation: 0.42, tailSize: 0.58, speed: 0.28, social: 0.08, realMotion: "sucker", pattern: "pleco", tailShape: "round", zone: [130, 176] },
  { name: "金鱼", body: ["#f9a236", "#ffd15f", "#fff1a7"], accent: "#ffcf8b", stripe: "#f57b35", size: 12.5, length: 2.65, depth: 1.22, undulation: 0.62, tailSize: 1.35, speed: 0.38, social: 0.28, realMotion: "glide", pattern: "goldfish", tailShape: "fan", zone: [54, 158] },
  { name: "锦鲤", body: ["#f5eee0", "#e14d36", "#1d2529"], accent: "#ffcb7c", stripe: "#d84b38", size: 13, length: 3.35, depth: 0.88, undulation: 0.74, tailSize: 0.94, speed: 0.42, social: 0.28, realMotion: "glide", pattern: "koi", tailShape: "round", zone: [52, 158] },
  { name: "帝王灯", body: ["#5b4a8f", "#a582d6", "#191b2c"], accent: "#7ef7ff", stripe: "#1b1f38", size: 8.5, length: 3.35, depth: 0.72, undulation: 0.86, tailSize: 0.88, speed: 0.72, social: 0.7, realMotion: "school", pattern: "emperor", tailShape: "fork", zone: [42, 132] },
  { name: "刚果灯", body: ["#77d8d4", "#d7a35c", "#8a75d6"], accent: "#a7fff0", stripe: "#f0d586", size: 10.5, length: 3.2, depth: 0.86, undulation: 0.76, tailSize: 1.15, speed: 0.62, social: 0.68, realMotion: "school", pattern: "congo", tailShape: "fan", zone: [45, 140] },
  { name: "玻璃猫", body: ["#d9f7ff", "#8eb6c8", "#eefcff"], accent: "#c6f7ff", stripe: "#f3ffff", size: 8.8, length: 4.1, depth: 0.42, undulation: 0.72, tailSize: 0.58, speed: 0.55, social: 0.84, realMotion: "school", pattern: "glassCat", tailShape: "fork", zone: [45, 138] },
  { name: "电光美人", body: ["#2f78d7", "#f5b24a", "#f0673f"], accent: "#8df5ff", stripe: "#ffe08a", size: 10.5, length: 3.05, depth: 0.82, undulation: 0.74, tailSize: 0.9, speed: 0.64, social: 0.52, realMotion: "glide", pattern: "rainbow", tailShape: "fork", zone: [48, 145] },
  { name: "蓝眼灯", body: ["#e6d07a", "#7bbdff", "#323d62"], accent: "#7deaff", stripe: "#4bbcff", size: 6.8, length: 3.2, depth: 0.58, undulation: 0.95, tailSize: 0.82, speed: 0.76, social: 0.74, realMotion: "school", pattern: "blueEye", tailShape: "fork", zone: [34, 118] },
  { name: "蓝曼龙", body: ["#8aa7c7", "#6d82b4", "#d7e2f3"], accent: "#9ff0ff", stripe: "#384b84", size: 11.5, length: 2.9, depth: 1.04, undulation: 0.46, tailSize: 0.88, speed: 0.32, social: 0.05, realMotion: "hover", pattern: "gouramiBars", tailShape: "round", zone: [38, 145] },
  { name: "接吻鱼", body: ["#f0c8c2", "#f8ded8", "#c98791"], accent: "#ffdcd3", stripe: "#cf8d96", size: 12, length: 2.8, depth: 1.08, undulation: 0.42, tailSize: 0.75, speed: 0.3, social: -0.05, realMotion: "hover", pattern: "plain", tailShape: "round", zone: [48, 152] },
  { name: "彩虹鲨", body: ["#1c2228", "#303844", "#0d1116"], accent: "#f3483d", stripe: "#f3483d", size: 11, length: 3.5, depth: 0.66, undulation: 0.95, tailSize: 0.82, speed: 0.64, social: -0.22, realMotion: "bottom", pattern: "redTail", tailShape: "fork", zone: [110, 174] },
  { name: "暹罗飞狐", body: ["#c7bd9c", "#8c876e", "#272a24"], accent: "#f1dfb5", stripe: "#20231e", size: 9.5, length: 3.85, depth: 0.52, undulation: 0.78, tailSize: 0.6, speed: 0.48, social: 0.22, realMotion: "bottom", pattern: "fox", tailShape: "fork", zone: [122, 176] },
  { name: "金苔鼠", body: ["#d7b14b", "#b98e31", "#7a5a22"], accent: "#f6d76e", stripe: "#946a2a", size: 10.5, length: 3.55, depth: 0.6, undulation: 0.44, tailSize: 0.52, speed: 0.32, social: 0.04, realMotion: "sucker", pattern: "algaeEater", tailShape: "tiny", zone: [128, 176] },
  { name: "紫条纹水母", bodyPlan: "jelly", body: ["#e9e5ee", "#c8bad7", "#fff8ff"], accent: "#c9a6d8", stripe: "#5d3a86", size: 13.2, length: 1, depth: 1, undulation: 0.58, tailSize: 1, speed: 0.21, social: 0.16, realMotion: "jelly", pattern: "purpleStripeJelly", tailShape: "none", zone: [38, 145], jelly: { bell: 1.12, tentacles: 24, oralArms: 6, rings: 3, radialLines: 22, pulse: 1.08, drift: 0.82, translucency: 0.74 } },
  { name: "太平洋海刺水母", bodyPlan: "jelly", body: ["#d79a58", "#a5583f", "#ffe1a4"], accent: "#d8a35e", stripe: "#82422f", size: 13.5, length: 1, depth: 1, undulation: 0.6, tailSize: 1, speed: 0.22, social: 0.08, realMotion: "jelly", pattern: "seaNettle", tailShape: "none", zone: [38, 145], jelly: { bell: 1.08, tentacles: 30, oralArms: 7, rings: 2, radialLines: 24, pulse: 1.14, drift: 0.75, translucency: 0.7 } },
  { name: "日本海刺水母", bodyPlan: "jelly", body: ["#d6a45f", "#b5573d", "#ffe4b0"], accent: "#e6b96a", stripe: "#7e3a2d", size: 12.5, length: 1, depth: 1, undulation: 0.54, tailSize: 1, speed: 0.21, social: 0.1, realMotion: "jelly", pattern: "sunburstNettle", tailShape: "none", zone: [40, 145], jelly: { bell: 1.04, tentacles: 24, oralArms: 6, rings: 2, radialLines: 18, pulse: 1.02, drift: 0.8, translucency: 0.72 } },
  { name: "蛋黄水母", bodyPlan: "jelly", body: ["#f2d37a", "#d89a39", "#fff2c4"], accent: "#f0d28b", stripe: "#fff2d0", size: 13.2, length: 1, depth: 1, undulation: 0.44, tailSize: 1, speed: 0.18, social: 0.14, realMotion: "jelly", pattern: "friedEggJelly", tailShape: "none", zone: [44, 150], jelly: { bell: 1.2, tentacles: 36, oralArms: 9, rings: 2, radialLines: 20, pulse: 0.88, drift: 0.78, translucency: 0.76 } },
  { name: "花笠水母", bodyPlan: "jelly", body: ["#f5e7bc", "#d9b276", "#fff5dc"], accent: "#a9d6c4", stripe: "#b2778f", size: 9.8, length: 1, depth: 1, undulation: 0.64, tailSize: 1, speed: 0.2, social: 0.02, realMotion: "jelly", pattern: "flowerHat", tailShape: "none", zone: [54, 150], jelly: { bell: 0.98, tentacles: 34, oralArms: 5, rings: 4, radialLines: 22, pulse: 1.18, drift: 0.68, translucency: 0.78 } },
  { name: "黑海刺水母", bodyPlan: "jelly", body: ["#6d4a78", "#3d263f", "#d6a6bd"], accent: "#c58aa8", stripe: "#2c1a30", size: 12.8, length: 1, depth: 1, undulation: 0.46, tailSize: 1, speed: 0.18, social: 0.06, realMotion: "jelly", pattern: "blackSeaNettle", tailShape: "none", zone: [42, 150], jelly: { bell: 1.12, tentacles: 32, oralArms: 8, rings: 2, radialLines: 18, pulse: 0.92, drift: 0.72, translucency: 0.68 } },
  { name: "皇冠水母", bodyPlan: "jelly", body: ["#c994b8", "#8c5d92", "#efd2df"], accent: "#d7a3be", stripe: "#774674", size: 11, length: 1, depth: 1, undulation: 0.52, tailSize: 1, speed: 0.19, social: 0.12, realMotion: "jelly", pattern: "crownJelly", tailShape: "none", zone: [42, 145], jelly: { bell: 1.08, tentacles: 36, oralArms: 8, rings: 4, radialLines: 20, pulse: 1.0, drift: 0.78, translucency: 0.74 } },
  { name: "蓝彩脂水母", bodyPlan: "jelly", body: ["#8bb7cf", "#48659b", "#d5f3f2"], accent: "#9ec8d9", stripe: "#5c4d9c", size: 10.8, length: 1, depth: 1, undulation: 0.52, tailSize: 1, speed: 0.24, social: 0.2, realMotion: "jelly", pattern: "blueBlubber", tailShape: "none", zone: [42, 145], jelly: { bell: 1.0, tentacles: 16, oralArms: 8, rings: 4, radialLines: 18, pulse: 1.2, drift: 0.82, translucency: 0.76 } },
  { name: "钟水母", bodyPlan: "jelly", body: ["#e8f0ec", "#b8c7c3", "#fffdf4"], accent: "#c7504d", stripe: "#b8403e", size: 8.8, length: 1, depth: 1, undulation: 0.56, tailSize: 1, speed: 0.22, social: 0.08, realMotion: "jelly", pattern: "bellJelly", tailShape: "none", zone: [50, 154], jelly: { bell: 0.92, tentacles: 42, oralArms: 1, rings: 2, radialLines: 16, pulse: 1.12, drift: 0.7, translucency: 0.78 } },
  { name: "金点泻湖水母", bodyPlan: "jelly", body: ["#c9b46d", "#8fb27a", "#fff1b0"], accent: "#d8c66f", stripe: "#9a8155", size: 10.8, length: 1, depth: 1, undulation: 0.46, tailSize: 1, speed: 0.18, social: 0.24, realMotion: "jelly", pattern: "spottedJelly", tailShape: "none", zone: [44, 142], jelly: { bell: 1.08, tentacles: 22, oralArms: 7, rings: 3, radialLines: 20, pulse: 0.92, drift: 0.86, translucency: 0.74 } }
];

const speciesTraitDefaults = {
  activity: 0.9,
  schooling: 0.25,
  territorial: 0.08,
  coverAffinity: 0.35,
  waterSensitivity: 0.45,
  breedingEase: 0.9,
  turnAgility: 0.95,
  feedStyle: "midwater"
};

const speciesTraitOverrides = {
  孔雀鱼: { activity: 0.95, schooling: 0.45, breedingEase: 1.25, turnAgility: 1.05, feedStyle: "surface" },
  霓虹灯鱼: { activity: 1.05, schooling: 1.0, coverAffinity: 0.45, breedingEase: 0.72, turnAgility: 1.12 },
  宝莲灯鱼: { activity: 0.98, schooling: 1.0, coverAffinity: 0.5, breedingEase: 0.65, turnAgility: 1.08 },
  斗鱼: { activity: 0.58, schooling: 0, territorial: 0.88, coverAffinity: 0.86, waterSensitivity: 0.64, breedingEase: 0.55, turnAgility: 0.72, feedStyle: "surface" },
  神仙鱼: { activity: 0.62, schooling: 0.22, territorial: 0.25, coverAffinity: 0.58, breedingEase: 0.62, turnAgility: 0.68 },
  七彩神仙鱼: { activity: 0.52, schooling: 0.32, coverAffinity: 0.72, waterSensitivity: 0.86, breedingEase: 0.42, turnAgility: 0.58 },
  斑马鱼: { activity: 1.28, schooling: 0.82, breedingEase: 1.05, turnAgility: 1.28, feedStyle: "surface" },
  白云金丝鱼: { activity: 1.05, schooling: 0.82, waterSensitivity: 0.32, breedingEase: 0.95, turnAgility: 1.15 },
  三角灯鱼: { activity: 0.86, schooling: 0.92, coverAffinity: 0.52, breedingEase: 0.72, turnAgility: 0.96 },
  红鼻剪刀: { activity: 1.08, schooling: 1.08, waterSensitivity: 0.78, breedingEase: 0.58, turnAgility: 1.12 },
  黑裙鱼: { activity: 0.78, schooling: 0.58, coverAffinity: 0.46, breedingEase: 0.82, turnAgility: 0.9 },
  虎皮鱼: { activity: 1.12, schooling: 0.62, territorial: 0.22, breedingEase: 0.86, turnAgility: 1.12 },
  樱桃灯: { activity: 0.76, schooling: 0.42, coverAffinity: 0.68, breedingEase: 0.9, turnAgility: 0.94 },
  红剑尾: { activity: 0.88, schooling: 0.38, breedingEase: 1.12, turnAgility: 1.0, feedStyle: "surface" },
  月光鱼: { activity: 0.78, schooling: 0.38, breedingEase: 1.16, turnAgility: 0.9, feedStyle: "surface" },
  玛丽鱼: { activity: 0.78, schooling: 0.34, breedingEase: 1.18, turnAgility: 0.9, feedStyle: "surface" },
  珍珠马甲: { activity: 0.56, schooling: 0.2, territorial: 0.12, coverAffinity: 0.7, breedingEase: 0.68, turnAgility: 0.74, feedStyle: "surface" },
  丽丽鱼: { activity: 0.58, schooling: 0.12, territorial: 0.22, coverAffinity: 0.74, breedingEase: 0.62, turnAgility: 0.76, feedStyle: "surface" },
  拉米雷兹短鲷: { activity: 0.82, schooling: 0.12, territorial: 0.38, coverAffinity: 0.7, waterSensitivity: 0.78, breedingEase: 0.5, turnAgility: 0.92, feedStyle: "bottom" },
  鼠鱼: { activity: 0.74, schooling: 0.9, territorial: 0, coverAffinity: 0.62, waterSensitivity: 0.42, breedingEase: 0.72, turnAgility: 0.82, feedStyle: "bottom" },
  库利泥鳅: { activity: 0.7, schooling: 0.48, territorial: 0, coverAffinity: 0.92, waterSensitivity: 0.48, breedingEase: 0.35, turnAgility: 1.18, feedStyle: "bottom" },
  小精灵鱼: { activity: 0.48, schooling: 0.2, territorial: 0, coverAffinity: 0.78, waterSensitivity: 0.7, breedingEase: 0.35, turnAgility: 0.58, feedStyle: "scrape" },
  黄金大胡子: { activity: 0.42, schooling: 0.08, territorial: 0.2, coverAffinity: 0.86, waterSensitivity: 0.58, breedingEase: 0.4, turnAgility: 0.54, feedStyle: "scrape" },
  金鱼: { activity: 0.54, schooling: 0.28, waterSensitivity: 0.5, breedingEase: 0.68, turnAgility: 0.68, feedStyle: "graze" },
  锦鲤: { activity: 0.62, schooling: 0.28, waterSensitivity: 0.42, breedingEase: 0.45, turnAgility: 0.72, feedStyle: "graze" },
  帝王灯: { activity: 0.92, schooling: 0.82, territorial: 0.1, coverAffinity: 0.48, breedingEase: 0.7, turnAgility: 1.02 },
  刚果灯: { activity: 0.86, schooling: 0.78, coverAffinity: 0.42, breedingEase: 0.6, turnAgility: 0.88 },
  玻璃猫: { activity: 0.64, schooling: 1.08, coverAffinity: 0.72, waterSensitivity: 0.72, breedingEase: 0.34, turnAgility: 0.72 },
  电光美人: { activity: 0.88, schooling: 0.5, waterSensitivity: 0.46, breedingEase: 0.62, turnAgility: 0.92 },
  蓝眼灯: { activity: 1.02, schooling: 0.88, waterSensitivity: 0.5, breedingEase: 0.78, turnAgility: 1.08 },
  蓝曼龙: { activity: 0.5, schooling: 0.08, territorial: 0.24, coverAffinity: 0.72, breedingEase: 0.58, turnAgility: 0.7, feedStyle: "surface" },
  接吻鱼: { activity: 0.48, schooling: 0.12, territorial: 0.18, coverAffinity: 0.5, breedingEase: 0.45, turnAgility: 0.62, feedStyle: "graze" },
  彩虹鲨: { activity: 0.86, schooling: 0.04, territorial: 0.92, coverAffinity: 0.82, breedingEase: 0.18, turnAgility: 0.86, feedStyle: "graze" },
  暹罗飞狐: { activity: 0.72, schooling: 0.24, territorial: 0.16, coverAffinity: 0.74, breedingEase: 0.28, turnAgility: 0.78, feedStyle: "scrape" },
  金苔鼠: { activity: 0.44, schooling: 0.08, territorial: 0.22, coverAffinity: 0.82, waterSensitivity: 0.52, breedingEase: 0.24, turnAgility: 0.55, feedStyle: "scrape" },
  紫条纹水母: { activity: 0.34, schooling: 0.12, territorial: 0.02, coverAffinity: 0.12, waterSensitivity: 0.8, breedingEase: 0.16, turnAgility: 0.36, feedStyle: "drift" },
  太平洋海刺水母: { activity: 0.38, schooling: 0.06, territorial: 0.08, coverAffinity: 0.08, waterSensitivity: 0.82, breedingEase: 0.18, turnAgility: 0.34, feedStyle: "drift" },
  日本海刺水母: { activity: 0.36, schooling: 0.08, territorial: 0.06, coverAffinity: 0.08, waterSensitivity: 0.82, breedingEase: 0.18, turnAgility: 0.34, feedStyle: "drift" },
  蓝彩脂水母: { activity: 0.44, schooling: 0.16, territorial: 0, coverAffinity: 0.1, waterSensitivity: 0.74, breedingEase: 0.22, turnAgility: 0.42, feedStyle: "drift" },
  蛋黄水母: { activity: 0.3, schooling: 0.1, territorial: 0, coverAffinity: 0.12, waterSensitivity: 0.78, breedingEase: 0.18, turnAgility: 0.32, feedStyle: "drift" },
  金点泻湖水母: { activity: 0.3, schooling: 0.2, territorial: 0, coverAffinity: 0.14, waterSensitivity: 0.76, breedingEase: 0.2, turnAgility: 0.34, feedStyle: "drift" },
  黑海刺水母: { activity: 0.3, schooling: 0.04, territorial: 0.08, coverAffinity: 0.12, waterSensitivity: 0.84, breedingEase: 0.12, turnAgility: 0.28, feedStyle: "drift" },
  皇冠水母: { activity: 0.36, schooling: 0.1, territorial: 0.06, coverAffinity: 0.12, waterSensitivity: 0.82, breedingEase: 0.15, turnAgility: 0.36, feedStyle: "drift" },
  花笠水母: { activity: 0.42, schooling: 0.04, territorial: 0.1, coverAffinity: 0.18, waterSensitivity: 0.82, breedingEase: 0.14, turnAgility: 0.4, feedStyle: "drift" },
  钟水母: { activity: 0.38, schooling: 0.04, territorial: 0.02, coverAffinity: 0.08, waterSensitivity: 0.78, breedingEase: 0.16, turnAgility: 0.34, feedStyle: "drift" }
};

for (const entry of species) {
  Object.assign(entry, speciesTraitDefaults, speciesTraitOverrides[entry.name] || {});
}

const speciesVisualDetails = {
  孔雀鱼: { scales: 0.78, pearlescence: 0.9, microSpots: 0.72, finVeins: 1.25 },
  霓虹灯鱼: { scales: 0.52, pearlescence: 1.1, microSpots: 0.18, finVeins: 0.7 },
  宝莲灯鱼: { scales: 0.54, pearlescence: 1.05, microSpots: 0.2, finVeins: 0.7 },
  斗鱼: { scales: 0.82, pearlescence: 0.95, microSpots: 0.5, finVeins: 1.55 },
  神仙鱼: { scales: 0.62, pearlescence: 0.58, microSpots: 0.12, finVeins: 1.25 },
  七彩神仙鱼: { scales: 0.92, pearlescence: 1.0, microSpots: 0.55, finVeins: 1.05 },
  斑马鱼: { scales: 0.45, pearlescence: 0.48, microSpots: 0.06, finVeins: 0.66 },
  白云金丝鱼: { scales: 0.5, pearlescence: 0.72, microSpots: 0.15, finVeins: 0.68 },
  三角灯鱼: { scales: 0.58, pearlescence: 0.6, microSpots: 0.1, finVeins: 0.7 },
  红鼻剪刀: { scales: 0.46, pearlescence: 0.58, microSpots: 0.08, finVeins: 0.7 },
  黑裙鱼: { scales: 0.62, pearlescence: 0.38, microSpots: 0.12, finVeins: 1.0 },
  虎皮鱼: { scales: 0.72, pearlescence: 0.48, microSpots: 0.18, finVeins: 0.82 },
  樱桃灯: { scales: 0.6, pearlescence: 0.55, microSpots: 0.18, finVeins: 0.72 },
  红剑尾: { scales: 0.66, pearlescence: 0.56, microSpots: 0.16, finVeins: 0.9 },
  月光鱼: { scales: 0.7, pearlescence: 0.62, microSpots: 0.18, finVeins: 0.78 },
  玛丽鱼: { scales: 0.76, pearlescence: 0.45, microSpots: 0.36, finVeins: 0.82 },
  珍珠马甲: { scales: 0.84, pearlescence: 0.7, microSpots: 0.82, finVeins: 1.1 },
  丽丽鱼: { scales: 0.78, pearlescence: 0.88, microSpots: 0.28, finVeins: 1.0 },
  拉米雷兹短鲷: { scales: 0.86, pearlescence: 0.92, microSpots: 0.62, finVeins: 0.95 },
  鼠鱼: { scales: 0.52, pearlescence: 0.32, microSpots: 0.7, finVeins: 0.62 },
  库利泥鳅: { scales: 0.16, pearlescence: 0.18, microSpots: 0.08, finVeins: 0.34 },
  小精灵鱼: { scales: 0.42, pearlescence: 0.34, microSpots: 0.3, finVeins: 0.48 },
  黄金大胡子: { scales: 0.5, pearlescence: 0.38, microSpots: 0.75, finVeins: 0.62 },
  金鱼: { scales: 0.95, pearlescence: 0.78, microSpots: 0.2, finVeins: 1.18 },
  锦鲤: { scales: 0.82, pearlescence: 0.45, microSpots: 0.18, finVeins: 0.9 },
  帝王灯: { scales: 0.58, pearlescence: 0.86, microSpots: 0.2, finVeins: 0.78 },
  刚果灯: { scales: 0.7, pearlescence: 1.05, microSpots: 0.34, finVeins: 1.15 },
  玻璃猫: { scales: 0.18, pearlescence: 1.15, microSpots: 0.06, finVeins: 0.46 },
  电光美人: { scales: 0.72, pearlescence: 1.12, microSpots: 0.34, finVeins: 0.88 },
  蓝眼灯: { scales: 0.48, pearlescence: 1.0, microSpots: 0.12, finVeins: 0.66 },
  蓝曼龙: { scales: 0.78, pearlescence: 0.82, microSpots: 0.32, finVeins: 1.0 },
  接吻鱼: { scales: 0.64, pearlescence: 0.52, microSpots: 0.1, finVeins: 0.62 },
  彩虹鲨: { scales: 0.55, pearlescence: 0.35, microSpots: 0.08, finVeins: 0.74 },
  暹罗飞狐: { scales: 0.48, pearlescence: 0.3, microSpots: 0.18, finVeins: 0.54 },
  金苔鼠: { scales: 0.62, pearlescence: 0.38, microSpots: 0.46, finVeins: 0.5 },
  紫条纹水母: { scales: 0.04, pearlescence: 1.08, microSpots: 0.34, finVeins: 1.35 },
  太平洋海刺水母: { scales: 0.06, pearlescence: 0.95, microSpots: 0.28, finVeins: 1.48 },
  日本海刺水母: { scales: 0.05, pearlescence: 0.88, microSpots: 0.24, finVeins: 1.36 },
  蓝彩脂水母: { scales: 0.04, pearlescence: 1.18, microSpots: 0.28, finVeins: 1.34 },
  蛋黄水母: { scales: 0.04, pearlescence: 0.92, microSpots: 0.42, finVeins: 1.28 },
  金点泻湖水母: { scales: 0.04, pearlescence: 1.12, microSpots: 0.78, finVeins: 1.32 },
  黑海刺水母: { scales: 0.03, pearlescence: 0.68, microSpots: 0.22, finVeins: 1.48 },
  皇冠水母: { scales: 0.04, pearlescence: 0.9, microSpots: 0.42, finVeins: 1.48 },
  花笠水母: { scales: 0.04, pearlescence: 1.1, microSpots: 0.58, finVeins: 1.7 },
  钟水母: { scales: 0.03, pearlescence: 0.82, microSpots: 0.16, finVeins: 1.52 }
};

for (const entry of species) {
  entry.visualDetail = speciesVisualDetails[entry.name] || { scales: 0.55, pearlescence: 0.5, microSpots: 0.2, finVeins: 0.7 };
  entry.bodyRgb = entry.body.map(hexToRgb);
  entry.accentRgb = hexToRgb(entry.accent);
  entry.stripeRgb = hexToRgb(entry.stripe);
}

let fish = [];
let foods = [];
let bubbles = [];
let ripples = [];
let waterQuality = 92;
let lightOn = true;
let lastTime = performance.now();
let lastDockedUpdate = performance.now();
let breedPulse = 0;
let grassLayer = null;
let grassLayerLight = null;
let tankBackgroundLayer = null;
let tankBackgroundLight = null;
let rockLayer = null;
let rockLayerLight = null;
let swayingGrassGeometry = null;
let grassFlowers = [];
let flowerBloomClock = rand(0.8, 2);
let lastStateSave = performance.now();
let stateSaveInFlight = false;
let queuedSaveTimer = null;

const FLOWER_MAX_COUNT = 6;
const FLOWER_LIFE_RANGE = [2700, 4500];
const FLOWER_BLOOM_INTERVAL = [90, 240];
const flowerTypes = [
  { name: "goldDot", petal: "#f7d87a", core: "#fff3a6", petals: 5, shape: "ellipse", rx: 0.72, ry: 0.38, spreadX: 0.82, spreadY: 0.56, size: 0.98, alpha: 0.92 },
  { name: "violetDot", petal: "#d6a8ff", core: "#fff0ba", petals: 5, shape: "ellipse", rx: 0.68, ry: 0.36, spreadX: 0.76, spreadY: 0.54, size: 0.95, alpha: 0.9 },
  { name: "roseDot", petal: "#f5a0b8", core: "#ffe7a1", petals: 5, shape: "ellipse", rx: 0.7, ry: 0.37, spreadX: 0.78, spreadY: 0.55, size: 1.0, alpha: 0.9 },
  { name: "limeDot", petal: "#b7e889", core: "#fff2a4", petals: 5, shape: "ellipse", rx: 0.66, ry: 0.34, spreadX: 0.76, spreadY: 0.52, size: 0.92, alpha: 0.88 },
  { name: "whiteStar", petal: "#edf7ff", core: "#ffe89a", petals: 6, shape: "point", rx: 0.64, ry: 0.25, spreadX: 0.88, spreadY: 0.48, size: 0.88, alpha: 0.86 },
  { name: "blueStar", petal: "#8fd9ff", core: "#f8f2b1", petals: 6, shape: "point", rx: 0.62, ry: 0.24, spreadX: 0.86, spreadY: 0.46, size: 0.9, alpha: 0.84 },
  { name: "apricotStar", petal: "#ffc07a", core: "#fff0a8", petals: 6, shape: "point", rx: 0.66, ry: 0.24, spreadX: 0.88, spreadY: 0.48, size: 0.94, alpha: 0.86 },
  { name: "mintStar", petal: "#9bf2cb", core: "#fff0a0", petals: 6, shape: "point", rx: 0.62, ry: 0.24, spreadX: 0.84, spreadY: 0.46, size: 0.88, alpha: 0.84 },
  { name: "pinkBell", petal: "#f0a6d7", core: "#ffe4a6", petals: 3, shape: "bell", rx: 0.52, ry: 0.46, spreadX: 0.46, spreadY: 0.6, size: 1.05, alpha: 0.88 },
  { name: "creamBell", petal: "#ffe6b7", core: "#fff8c7", petals: 3, shape: "bell", rx: 0.5, ry: 0.44, spreadX: 0.44, spreadY: 0.58, size: 0.98, alpha: 0.84 },
  { name: "lavenderBell", petal: "#bfa7ff", core: "#fff1b8", petals: 3, shape: "bell", rx: 0.52, ry: 0.44, spreadX: 0.45, spreadY: 0.58, size: 1.0, alpha: 0.86 },
  { name: "redBell", petal: "#ff8d8d", core: "#ffe4a0", petals: 3, shape: "bell", rx: 0.5, ry: 0.43, spreadX: 0.44, spreadY: 0.57, size: 0.94, alpha: 0.84 },
  { name: "lotusPink", petal: "#ffb5ca", core: "#fff0a6", petals: 8, shape: "lotus", rx: 0.5, ry: 0.26, spreadX: 0.72, spreadY: 0.42, size: 1.08, alpha: 0.9 },
  { name: "lotusBlue", petal: "#a8d6ff", core: "#fff1aa", petals: 8, shape: "lotus", rx: 0.48, ry: 0.25, spreadX: 0.7, spreadY: 0.41, size: 1.02, alpha: 0.86 },
  { name: "lotusWhite", petal: "#f8ffff", core: "#fff2ac", petals: 8, shape: "lotus", rx: 0.48, ry: 0.25, spreadX: 0.7, spreadY: 0.4, size: 0.96, alpha: 0.82 },
  { name: "lotusPurple", petal: "#d7b2ff", core: "#ffeeaa", petals: 8, shape: "lotus", rx: 0.5, ry: 0.25, spreadX: 0.72, spreadY: 0.42, size: 1.0, alpha: 0.86 },
  { name: "tinyYellow", petal: "#ffe56f", core: "#fff6b4", petals: 4, shape: "ellipse", rx: 0.5, ry: 0.3, spreadX: 0.58, spreadY: 0.45, size: 0.72, alpha: 0.9 },
  { name: "tinyWhite", petal: "#effcff", core: "#fff0a2", petals: 4, shape: "ellipse", rx: 0.48, ry: 0.28, spreadX: 0.56, spreadY: 0.43, size: 0.68, alpha: 0.82 },
  { name: "tinyBlue", petal: "#89c9ff", core: "#ffefa0", petals: 4, shape: "ellipse", rx: 0.48, ry: 0.28, spreadX: 0.56, spreadY: 0.43, size: 0.7, alpha: 0.84 },
  { name: "tinyCoral", petal: "#ff9c80", core: "#fff0a7", petals: 4, shape: "ellipse", rx: 0.5, ry: 0.28, spreadX: 0.57, spreadY: 0.43, size: 0.72, alpha: 0.86 },
  { name: "sprigLilac", petal: "#caa5ff", core: "#f7e7a4", petals: 3, shape: "sprig", rx: 0.34, ry: 0.28, spreadX: 0.55, spreadY: 0.48, size: 0.82, alpha: 0.82 },
  { name: "sprigAmber", petal: "#ffc96f", core: "#fff1aa", petals: 3, shape: "sprig", rx: 0.34, ry: 0.28, spreadX: 0.55, spreadY: 0.48, size: 0.8, alpha: 0.84 },
  { name: "sprigAqua", petal: "#8fe8e2", core: "#fff2a8", petals: 3, shape: "sprig", rx: 0.33, ry: 0.27, spreadX: 0.54, spreadY: 0.47, size: 0.78, alpha: 0.8 },
  { name: "sprigRose", petal: "#f6a4be", core: "#ffeaa8", petals: 3, shape: "sprig", rx: 0.34, ry: 0.28, spreadX: 0.55, spreadY: 0.48, size: 0.82, alpha: 0.84 },
  { name: "deepMagenta", petal: "#e56ac8", core: "#ffe177", petals: 5, shape: "ellipse", rx: 0.68, ry: 0.34, spreadX: 0.76, spreadY: 0.52, size: 0.86, alpha: 0.76 },
  { name: "deepOrange", petal: "#f08a47", core: "#ffe27a", petals: 5, shape: "ellipse", rx: 0.66, ry: 0.34, spreadX: 0.76, spreadY: 0.52, size: 0.88, alpha: 0.78 },
  { name: "deepCyan", petal: "#57d5e5", core: "#fff09b", petals: 5, shape: "ellipse", rx: 0.66, ry: 0.33, spreadX: 0.74, spreadY: 0.5, size: 0.86, alpha: 0.76 },
  { name: "deepRuby", petal: "#e75d72", core: "#ffe085", petals: 5, shape: "ellipse", rx: 0.65, ry: 0.33, spreadX: 0.74, spreadY: 0.5, size: 0.84, alpha: 0.76 },
  { name: "paleGreenCup", petal: "#ccf5a3", core: "#fff4a6", petals: 7, shape: "lotus", rx: 0.45, ry: 0.24, spreadX: 0.66, spreadY: 0.38, size: 0.86, alpha: 0.82 },
  { name: "palePeachCup", petal: "#ffd0ae", core: "#fff3a7", petals: 7, shape: "lotus", rx: 0.45, ry: 0.24, spreadX: 0.66, spreadY: 0.38, size: 0.88, alpha: 0.84 }
];

class Fish {
  constructor(kind, x, y, age = 1, personality = makePersonality()) {
    this.kind = kind;
    this.spec = species[kind];
    this.personality = personality;
    this.x = x;
    this.y = y;
    this.vx = rand(-0.55, 0.55) || 0.25;
    this.vy = rand(-0.09, 0.09);
    this.heading = Math.atan2(this.vy * 0.45, this.vx);
    this.swimSpeed = clamp(Math.hypot(this.vx, this.vy), 0.1, this.spec.speed);
    this.turnIntent = 0;
    this.turnBend = 0;
    this.yaw = Math.cos(this.heading) >= 0 ? 0 : Math.PI;
    this.targetYaw = this.yaw;
    this.headYaw = this.yaw;
    this.bodyYaw = this.yaw;
    this.tailYaw = this.yaw;
    this.visualPitch = 0;
    this.zoneDrift = rand(0, Math.PI * 2);
    this.burstClock = rand(0, 8);
    this.resting = this.spec.realMotion === "sucker" ? rand(0, 1) : 0;
    this.pectoralPhase = rand(0, Math.PI * 2);
    this.age = age;
    this.hunger = rand(24, 68) / this.personality.appetite;
    this.energy = rand(0.65, 1.1) * (0.9 + this.personality.pace * 0.08);
    this.satiety = rand(0.12, 0.42);
    this.stamina = rand(0.68, 1);
    this.stress = rand(0.05, 0.2);
    this.target = null;
    this.foodMemory = { x: x, y: y, life: 0 };
    this.dangerMemory = { x: x, y: y, life: 0 };
    this.courtshipReadiness = 0;
    this.wander = rand(0, 1000);
    this.courtship = 0;
    this.interact = 0;
    this.cooldown = rand(initialBreedingCooldown[0], initialBreedingCooldown[1]);
    this.born = performance.now();
    this.bodyPhase = rand(0, Math.PI * 2);
    this.feedRush = 0;
    this.feedingHalo = 0;
    this.interactionMode = "none";
    this.jellyPulse = rand(0, Math.PI * 2);
    this.tentacleSeed = rand(0, 1000);
    this.neighbors = [];
    this.spine = [];
    this.force = { x: 0, y: 0 };
    if (this.spec.bodyPlan === "jelly") {
      this.vx = rand(-0.14, 0.14);
      this.vy = rand(-0.045, 0.045);
      this.heading = -Math.PI / 2 + rand(-0.55, 0.55);
      this.swimSpeed = clamp(Math.hypot(this.vx, this.vy), 0.035, this.spec.speed);
    }
  }

  get radius() {
    return this.spec.size * (0.42 + this.age * 0.58);
  }

  get adult() {
    return this.age > 0.82;
  }

  get ageStage() {
    if (this.age < 0.48) return "fry";
    if (this.age < 0.82) return "juvenile";
    if (this.age > 0.98 && performance.now() - this.born > 1000 * 180) return "old";
    return "adult";
  }

  update(dt) {
    if (this.spec.bodyPlan === "jelly") {
      this.updateJelly(dt);
      return;
    }

    this.age = clamp(this.age + dt * 0.006, 0.28, 1);
    this.satiety = clamp(this.satiety - dt * (0.028 + this.spec.activity * 0.018), 0, 1);
    this.hunger = clamp(this.hunger + dt * 2.2 * this.personality.appetite, 0, 100);
    this.foodMemory.life = Math.max(0, this.foodMemory.life - dt);
    this.dangerMemory.life = Math.max(0, this.dangerMemory.life - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.courtship = Math.max(0, this.courtship - dt * 2.6);
    this.courtshipReadiness = Math.max(0, this.courtshipReadiness - dt * 0.22);
    this.interact = Math.max(0, this.interact - dt * 2.2);
    this.feedRush = Math.max(0, this.feedRush - dt * 2.6);
    this.feedingHalo = Math.max(0, this.feedingHalo - dt * 2.2);
    this.interactionMode = this.interact > 0 ? this.interactionMode : "none";
    const crowdStress = this.localCrowdStress();
    const qualityStress = clamp((58 - waterQuality) / 58, 0, 1) * this.spec.waterSensitivity;
    const lightStress = lightOn ? 0 : this.spec.activity * 0.08;
    const hungerStress = this.hunger > 74 ? (this.hunger - 74) / 100 : 0;
    const targetStress = clamp(qualityStress * 0.48 + crowdStress * 0.24 + lightStress + hungerStress * 0.18 + this.dangerMemory.life * 0.12, 0, 1);
    const ageStage = this.ageStage;
    this.stress += (targetStress - this.stress) * Math.min(1, dt * 0.45);
    this.stamina = clamp(this.stamina + dt * (0.1 - Math.max(0, this.swimSpeed - this.spec.speed * 0.72) * 0.13) - this.stress * dt * 0.025, 0.22, 1);
    this.wander += dt * (0.45 + this.energy * 0.38) * this.personality.pace * this.spec.activity;
    this.burstClock += dt;
    this.pectoralPhase += dt * (this.spec.realMotion === "hover" || this.spec.realMotion === "disk" || this.spec.realMotion === "sail" ? 7.2 : 4.8) * (0.86 + this.personality.pace * 0.14) * (0.86 + this.spec.activity * 0.14);
    this.bodyPhase += dt * (3.4 + Math.hypot(this.vx, this.vy) * 7.6) * this.spec.undulation * (0.82 + this.personality.pace * 0.18) * (0.84 + this.spec.activity * 0.16);

    const burstPulse = this.motionPulse();
    let ax = Math.sin(this.wander * 1.7) * 0.014 * burstPulse * this.personality.roam * this.spec.activity;
    let ay = Math.cos(this.wander * 1.15) * 0.004 * (0.7 + this.personality.curiosity * 0.6);
    const zone = this.spec.zone || [34, bottom - 10];
    const zoneSpan = zone[1] - zone[0];
    const zoneCenter = (zone[0] + zone[1]) / 2 + this.personality.layerOffset * zoneSpan * 0.34 + Math.sin(this.zoneDrift + this.wander * 0.25) * zoneSpan * 0.16 * this.personality.roam;
    ay += clamp((zoneCenter - this.y) * 0.0009 * (0.8 + this.personality.caution * 0.45), -0.018, 0.018);
    ax += clamp((this.personality.homeX - this.x) * 0.00008 * (1.25 - this.personality.roam), -0.012, 0.012);

    const pellet = this.closestFood(120 + this.personality.curiosity * 72 + this.personality.boldness * 34);
    if (pellet) {
      this.foodMemory = { x: pellet.x, y: pellet.y, life: 5 + this.personality.curiosity * 2 };
    }
    const memoryTarget = !pellet && this.foodMemory.life > 0 && this.hunger > 45 ? this.foodMemory : null;
    const feedThreshold = 42 - this.personality.boldness * 14 - (this.personality.appetite - 1) * 12 + this.satiety * 42;
    if ((pellet || memoryTarget) && this.hunger > feedThreshold) {
      const target = pellet || memoryTarget;
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const rivals = pellet ? this.foodRivalPressure(pellet) : 0;
      const foodDrive = (0.92 + this.personality.boldness * 0.72 + this.personality.appetite * 0.34 + rivals * 0.18) * (1 - this.satiety * 0.36);
      const lunge = d < 44 ? 1.45 + rivals * 0.18 : 1;
      this.feedRush = Math.max(this.feedRush, clamp((90 - d) / 90, 0, 1));
      this.feedingHalo = Math.max(this.feedingHalo, 0.8);
      ax += (dx / d) * 0.07 * foodDrive * lunge;
      ay += (dy / d) * 0.028 * foodDrive * lunge;
      if (pellet) {
        this.force.x = 0;
        this.force.y = 0;
        this.applyFeedingContest(pellet, this.force);
        ax += this.force.x;
        ay += this.force.y;
      }
      if (pellet && d < this.radius + 4) {
        pellet.eaten = true;
        this.hunger = Math.max(0, this.hunger - 44);
        this.satiety = clamp(this.satiety + 0.34, 0, 1);
        this.energy = clamp(this.energy + 0.12, 0.6, 1.25);
        this.feedRush = 1;
        this.interactionMode = "snatch";
        makeRipple(this.x, this.y, "food");
      }
    } else {
      const mate = this.closestMate();
      if (mate && this.adult && this.cooldown <= 0 && waterQuality > 58 && lightOn && this.personality.boldness > 0.18) {
        const dx = mate.x - this.x;
        const dy = mate.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const courtshipDrive = (0.65 + this.personality.boldness * 0.45 + Math.max(0, this.personality.sociability) * 0.3) * (1 - this.stress * 0.55) * (0.72 + this.satiety * 0.3);
        ax += (dx / d) * 0.015 * courtshipDrive;
        ay += (dy / d) * 0.007 * courtshipDrive;
        this.courtship = clamp(this.courtship + dt * 1.8, 0, 1);
        this.courtshipReadiness = clamp(this.courtshipReadiness + dt * (d < 26 ? 0.28 : 0.08) * courtshipDrive, 0, 1);
        if (d < 16 && this.courtshipReadiness > 0.82 && mate.courtshipReadiness > 0.52 && Math.random() < breedingChance * this.spec.breedingEase * mate.spec.breedingEase) {
          spawnFry(this, mate);
          this.courtshipReadiness = 0;
          mate.courtshipReadiness = 0;
          this.cooldown = rand(breedingCooldown[0], breedingCooldown[1]);
          mate.cooldown = rand(breedingCooldown[0], breedingCooldown[1]);
        }
      }
    }

    this.force.x = 0;
    this.force.y = 0;
    this.applyInteractionForces(this.force);
    ax += this.force.x;
    ay += this.force.y;

    if (this.dangerMemory.life > 0) {
      const dx = this.dangerMemory.x - this.x;
      const dy = this.dangerMemory.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const flee = clamp(this.dangerMemory.life / 5, 0, 1) * (0.7 + this.personality.caution * 0.6);
      ax -= (dx / d) * 0.016 * flee;
      ay -= (dy / d) * 0.008 * flee;
    }

    if (this.spec.territorial > 0.35) {
      const zone = this.spec.zone || [34, bottom - 10];
      const patrolY = Math.min(zone[1] - 8, bottom - 22);
      const dx = this.personality.homeX - this.x;
      const dy = patrolY - this.y;
      const d = Math.hypot(dx, dy) || 1;
      ax += (dx / d) * 0.0035 * this.spec.territorial;
      ay += (dy / d) * 0.0015 * this.spec.territorial;
    }

    if ((this.personality.caution > 0.7 || this.spec.coverAffinity > 0.68 || this.stress > 0.52 || ageStage === "fry") && (fish.length > 8 || this.stress > 0.52 || ageStage === "fry")) {
      const shelter = shelterPointFor(this);
      const dx = shelter.x - this.x;
      const dy = shelter.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const coverDrive = Math.max(this.personality.caution, this.spec.coverAffinity, this.stress);
      ax += (dx / d) * 0.004 * coverDrive;
      ay += (dy / d) * 0.002 * coverDrive;
    }

    if (this.spec.realMotion === "graze") {
      const plantX = 268;
      const dx = plantX - this.x;
      const dy = bottom - 38 - this.y;
      const d = Math.hypot(dx, dy) || 1;
      ax += (dx / d) * 0.006;
      ay += (dy / d) * 0.002;
    }

    if (this.spec.realMotion === "bottom" || this.spec.realMotion === "loach" || this.spec.realMotion === "sucker") {
      ay += clamp((zone[1] - 5 - this.y) * 0.0012, -0.012, 0.018);
      if (this.spec.realMotion === "loach") ax += Math.sin(this.bodyPhase * 0.9) * 0.018;
      if (this.spec.realMotion === "sucker") {
        ax *= this.resting > 0.38 ? 0.22 : 0.55;
        ay *= 0.48;
        this.resting = (this.resting + dt * 0.08) % 1;
      }
    }

    if (this.spec.realMotion === "hover" || this.spec.realMotion === "disk" || this.spec.realMotion === "sail") {
      ax *= 0.58;
      ay += Math.sin(this.wander * 2.1) * 0.003;
    }

    if (this.spec.realMotion === "burst") {
      ax *= burstPulse;
      ay *= 0.74;
    }

    if (this.x < 24) ax += 0.055;
    if (this.x > W - 24) ax -= 0.055;
    if (this.y < 34) ay += 0.035;
    if (this.y > bottom - 12) ay -= 0.045;

    const qualityDrag = waterQuality < 42 ? 0.972 - qualityStress * 0.018 : 0.985 - qualityStress * 0.01;
    const stageSpeed = ageStage === "fry" ? 0.72 : ageStage === "juvenile" ? 0.9 : ageStage === "old" ? 0.78 : 1;
    const maxSpeed = this.spec.speed * (0.78 + this.personality.pace * 0.28) * (0.86 + this.spec.activity * 0.16) * (0.72 + this.stamina * 0.34) * (1 - this.stress * 0.22) * stageSpeed * (1 + this.feedRush * 0.42);
    const desiredVx = clamp((this.vx + ax) * qualityDrag, -maxSpeed, maxSpeed);
    const desiredVy = clamp((this.vy + ay * 0.72) * qualityDrag, -maxSpeed * 0.18, maxSpeed * 0.18);
    const desiredSpeed = Math.hypot(desiredVx, desiredVy);

    if (desiredSpeed > 0.004) {
      const desiredHeading = Math.atan2(desiredVy, desiredVx);
      this.turnIntent = angleDelta(this.heading, desiredHeading);
      const turnRate = ((this.spec.realMotion === "hover" || this.spec.realMotion === "disk" || this.spec.realMotion === "sail" ? 1.85 : 2.85) + this.swimSpeed * 1.45) * (0.84 + this.personality.boldness * 0.24) * this.spec.turnAgility;
      this.heading = rotateTowardAngle(this.heading, desiredHeading, turnRate * dt);
    }
    this.turnBend += (clamp(this.turnIntent, -1.2, 1.2) - this.turnBend) * Math.min(1, dt * 5.2);

    const turnPenalty = 1 - Math.min(0.34, Math.abs(this.turnIntent) * 0.16);
    const targetSpeed = clamp(desiredSpeed * turnPenalty * burstPulse, 0.012, maxSpeed);
    this.swimSpeed += (targetSpeed - this.swimSpeed) * Math.min(1, dt * 3.4);
    this.vx = Math.cos(this.heading) * this.swimSpeed;
    this.vy = Math.sin(this.heading) * this.swimSpeed * 0.52;

    this.targetYaw = Math.cos(this.heading) >= 0 ? 0 : Math.PI;
    const yawRate = this.spec.realMotion === "hover" || this.spec.realMotion === "disk" || this.spec.realMotion === "sail" ? 1.65 : 2.25;
    this.headYaw = rotateTowardAngle(this.headYaw, this.targetYaw, yawRate * dt);
    this.bodyYaw += angleDelta(this.bodyYaw, this.headYaw) * Math.min(1, dt * 3.8);
    this.tailYaw += angleDelta(this.tailYaw, this.bodyYaw) * Math.min(1, dt * 2.7);
    this.yaw = this.bodyYaw;
    const pitchTarget = clamp(Math.sin(this.heading) * 0.12, -0.12, 0.12);
    this.visualPitch += (pitchTarget - this.visualPitch) * Math.min(1, dt * 3.2);

    const flow = waterFlowAt(this.x, this.y);
    this.x += (this.vx + flow.x) * dt * 60;
    this.y += (this.vy + flow.y) * dt * 60;
    this.x = clamp(this.x, 15, W - 15);
    this.y = clamp(this.y, 30, bottom - 5);
  }

  motionPulse() {
    if (this.spec.realMotion === "burst") {
      const cycle = this.burstClock % 2.4;
      return cycle < 0.55 ? 1.28 : cycle < 1.15 ? 0.58 : 0.82;
    }
    if (this.spec.realMotion === "bottom" || this.spec.realMotion === "sucker") return 0.66;
    if (this.spec.realMotion === "loach") return 0.92 + Math.sin(this.bodyPhase) * 0.16;
    if (this.spec.realMotion === "hover" || this.spec.realMotion === "disk" || this.spec.realMotion === "sail") return 0.72;
    if (this.spec.realMotion === "school") return 1.04;
    return 1;
  }

  updateJelly(dt) {
    this.age = clamp(this.age + dt * 0.003, 0.3, 1);
    this.hunger = clamp(this.hunger + dt * 1.35 * this.personality.appetite, 0, 100);
    this.satiety = clamp(this.satiety - dt * 0.014, 0, 1);
    this.foodMemory.life = Math.max(0, this.foodMemory.life - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.courtship = Math.max(0, this.courtship - dt * 1.4);
    this.courtshipReadiness = Math.max(0, this.courtshipReadiness - dt * 0.14);
    this.interact = Math.max(0, this.interact - dt * 1.3);
    this.feedRush = Math.max(0, this.feedRush - dt * 1.5);
    this.feedingHalo = Math.max(0, this.feedingHalo - dt * 1.6);
    this.jellyPulse += dt * (1.4 + this.spec.jelly.pulse * 1.9);
    this.wander += dt * (0.28 + this.spec.activity * 0.34);
    this.bodyPhase = this.jellyPulse;

    const pulse = Math.pow(Math.max(0, Math.sin(this.jellyPulse)), 2.4);
    let ax = Math.sin(this.wander * 0.8 + this.tentacleSeed) * 0.004 * this.spec.jelly.drift;
    let ay = -0.006 * pulse * this.spec.jelly.pulse + Math.cos(this.wander * 0.7) * 0.002;

    const pellet = this.closestFood(110 + this.personality.curiosity * 54, Math.PI);
    if (pellet && this.hunger > 36 + this.satiety * 28) {
      const dx = pellet.x - this.x;
      const dy = pellet.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      ax += (dx / d) * 0.015;
      ay += (dy / d) * 0.01;
      this.feedRush = Math.max(this.feedRush, clamp((80 - d) / 80, 0, 1));
      this.feedingHalo = Math.max(this.feedingHalo, 0.55);
      if (d < this.radius + 6) {
        pellet.eaten = true;
        this.hunger = Math.max(0, this.hunger - 32);
        this.satiety = clamp(this.satiety + 0.22, 0, 1);
        makeRipple(this.x, this.y, "food");
      }
    }

    for (const other of this.neighbors) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 28) {
        ax -= (dx / d) * 0.012;
        ay -= (dy / d) * 0.006;
        this.interact = 0.7;
        this.interactionMode = "brush";
      } else if (other.kind === this.kind && d < 76) {
        ax += (dx / d) * 0.0018 * this.spec.schooling;
        ay += (dy / d) * 0.0008 * this.spec.schooling;
      }
    }

    const zone = this.spec.zone || [34, bottom - 10];
    const zoneCenter = (zone[0] + zone[1]) / 2 + Math.sin(this.wander + this.tentacleSeed) * (zone[1] - zone[0]) * 0.22;
    ay += clamp((zoneCenter - this.y) * 0.00055, -0.006, 0.006);
    if (this.spec.pattern === "upsideDown") ay += clamp((zone[1] - 5 - this.y) * 0.0015, -0.01, 0.014);

    if (this.x < 26) ax += 0.018;
    if (this.x > W - 26) ax -= 0.018;
    if (this.y < 30) ay += 0.016;
    if (this.y > bottom - 8) ay -= 0.018;

    const flow = waterFlowAt(this.x, this.y);
    const drag = 0.988 - clamp((58 - waterQuality) / 58, 0, 1) * 0.012;
    const maxSpeed = this.spec.speed * (0.72 + this.spec.activity * 0.34) * (1 + this.feedRush * 0.28);
    this.vx = clamp((this.vx + ax + flow.x * 0.6) * drag, -maxSpeed, maxSpeed);
    this.vy = clamp((this.vy + ay + flow.y * 0.5) * drag, -maxSpeed * 0.62, maxSpeed * 0.62);
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.x = clamp(this.x, 16, W - 16);
    this.y = clamp(this.y, 28, bottom - 4);
    if (Math.hypot(this.vx, this.vy) > 0.002) this.heading = Math.atan2(this.vy, this.vx);
  }

  canSense(x, y, range, fov = Math.PI * 0.78) {
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > range) return false;
    if (d < this.radius * 4.2) return true;
    const dot = (dx / d) * Math.cos(this.heading) + (dy / d) * Math.sin(this.heading);
    return dot > Math.cos(fov);
  }

  localCrowdStress() {
    let crowd = 0;
    for (const other of this.neighbors) {
      const d = dist(this, other);
      if (d < 44) crowd += (44 - d) / 44;
    }
    return clamp(crowd / 4, 0, 1);
  }

  closestFood(range = 110) {
    let chosen = null;
    let best = Infinity;
    for (const food of foods) {
      const d = Math.hypot(food.x - this.x, food.y - this.y);
      if (!this.canSense(food.x, food.y, range, Math.PI * (0.58 + this.personality.curiosity * 0.24))) continue;
      const style = this.spec.feedStyle;
      let stylePenalty = 0;
      if (style === "surface") stylePenalty = Math.max(0, food.y - 68) * 1.3;
      else if (style === "bottom") stylePenalty = Math.max(0, bottom - 44 - food.y) * 1.1;
      else if (style === "scrape") stylePenalty = Math.max(0, bottom - 28 - food.y) * 1.45;
      else if (style === "graze") stylePenalty = Math.abs(food.y - (bottom - 36)) * 0.35;
      const score = d + stylePenalty;
      if (score < best && d < range) {
        best = score;
        chosen = food;
      }
    }
    return chosen;
  }

  foodRivalPressure(food) {
    let rivals = 0;
    for (const other of fish) {
      if (other === this || other.spec.bodyPlan === "jelly") continue;
      const d = Math.hypot(other.x - food.x, other.y - food.y);
      if (d < 42 && other.hunger > 34) rivals += (42 - d) / 42;
    }
    return clamp(rivals, 0, 3);
  }

  applyFeedingContest(food, force) {
    for (const other of this.neighbors) {
      if (other.spec.bodyPlan === "jelly") continue;
      const own = Math.hypot(this.x - food.x, this.y - food.y);
      const their = Math.hypot(other.x - food.x, other.y - food.y);
      const d = dist(this, other) || 1;
      if (d > 32 || their > 48 || own > 56) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const competitive = this.personality.boldness + this.personality.appetite * 0.35 - other.personality.caution * 0.25;
      const shove = clamp((32 - d) / 32, 0, 1) * (0.016 + competitive * 0.012);
      force.x -= (dx / d) * shove;
      force.y -= (dy / d) * shove * 0.62;
      this.interact = Math.max(this.interact, 0.65);
      this.interactionMode = "contest";
    }
  }

  closestMate() {
    let chosen = null;
    let best = Infinity;
    for (const other of this.neighbors) {
      if (other.kind !== this.kind || !other.adult) continue;
      const d = dist(this, other);
      if (d < best && d < 72) {
        best = d;
        chosen = other;
      }
    }
    return chosen;
  }

  applyInteractionForces(force) {
    let closeNeighbors = 0;
    let schoolCount = 0;
    let alignX = 0;
    let alignY = 0;
    let centerX = 0;
    let centerY = 0;
    for (const other of this.neighbors) {
      const d = dist(this, other);
      if (d < 34) closeNeighbors += 1;
      if (other.kind === this.kind && d < 92 && this.canSense(other.x, other.y, 105, Math.PI * 0.74)) {
        alignX += Math.cos(other.heading);
        alignY += Math.sin(other.heading);
        centerX += other.x;
        centerY += other.y;
        schoolCount += 1;
      } else if (other.spec.bodyPlan !== "jelly" && this.spec.bodyPlan !== "jelly" && this.spec.realMotion === other.spec.realMotion && d > 32 && d < 72 && this.personality.sociability > 0.18 && other.personality.sociability > 0.08) {
        force.x += ((other.x - this.x) / d) * 0.0018;
        force.y += ((other.y - this.y) / d) * 0.0009;
      }
    }
    const crowdPressure = Math.min(1.8, closeNeighbors * 0.22);
    const separation = 0.82 + this.personality.caution * 0.52 + this.spec.territorial * 0.42 - Math.max(0, this.personality.sociability + this.spec.schooling * 0.2) * 0.16;
    const socialBias = clamp(this.spec.social + this.personality.sociability + this.spec.schooling * 0.28 - this.spec.territorial * 0.45, -0.55, 1.28);

    if (schoolCount > 0 && this.spec.schooling > 0.18) {
      const inv = 1 / schoolCount;
      const avgHeading = Math.atan2(alignY * inv, alignX * inv);
      const selfDirX = Math.cos(this.heading);
      const selfDirY = Math.sin(this.heading);
      const schoolTurn = angleDelta(this.heading, avgHeading);
      force.x -= selfDirY * schoolTurn * 0.006 * this.spec.schooling;
      force.y += selfDirX * schoolTurn * 0.0025 * this.spec.schooling;
      const cx = centerX * inv;
      const cy = centerY * inv;
      const dx = cx - this.x;
      const dy = cy - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 38) {
        force.x += (dx / d) * 0.0045 * this.spec.schooling;
        force.y += (dy / d) * 0.0024 * this.spec.schooling;
      }
    }

    for (const other of this.neighbors) {
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 86) continue;

      const avoidX = -(dx / d);
      const avoidY = -(dy / d);

      if (this.kind === other.kind && socialBias > 0) {
        if (d < 24) {
          const strength = (24 - d) / 24;
          force.x += avoidX * (0.04 + strength * 0.07 + crowdPressure * 0.025) * separation;
          force.y += avoidY * (0.026 + strength * 0.045 + crowdPressure * 0.018) * separation;
        } else if (d > 42 && d < 82 && closeNeighbors < 3) {
          force.x += (dx / d) * socialBias * 0.0038;
          force.y += (dy / d) * socialBias * 0.0022;
        } else if (d < 34) {
          force.x += avoidX * (0.018 + crowdPressure * 0.012) * separation;
          force.y += avoidY * (0.012 + crowdPressure * 0.008) * separation;
        }
      } else if ((socialBias < 0 || this.spec.territorial > 0.42) && d < 44 + this.spec.territorial * 18) {
        force.x += avoidX * (0.038 + Math.abs(socialBias) * 0.026 + this.spec.territorial * 0.022);
        force.y += avoidY * (0.022 + Math.abs(socialBias) * 0.014 + this.spec.territorial * 0.012);
        this.interact = 1;
        this.interactionMode = "chase";
        this.dangerMemory = { x: other.x, y: other.y, life: Math.max(this.dangerMemory.life, 3.2 + this.spec.territorial * 2) };
      } else if (other.spec.bodyPlan === "jelly" && d < 48) {
        const brush = (48 - d) / 48;
        force.x += avoidX * (0.02 + brush * 0.032);
        force.y += avoidY * (0.012 + brush * 0.018);
        this.interact = Math.max(this.interact, 0.72);
        this.interactionMode = "jellyAvoid";
      } else if (d < 28) {
        const strength = (28 - d) / 28;
        force.x += avoidX * (0.026 + strength * 0.045) * separation;
        force.y += avoidY * (0.016 + strength * 0.026) * separation;
        this.interactionMode = this.interactionMode === "none" ? "yield" : this.interactionMode;
      }

      if (this.age < 0.65 && other.age > 0.8 && d < 50) {
        force.x += (dx / d) * 0.008 * (0.7 + this.personality.sociability);
        force.y += (dy / d) * 0.005 * (0.7 + this.personality.sociability);
        this.interact = Math.max(this.interact, 0.4);
        this.interactionMode = "follow";
      }
    }
  }

  draw(time) {
    if (this.spec.bodyPlan === "jelly") {
      drawJellyfish(this, time);
      return;
    }

    const scale = 0.58 + this.age * 0.48;
    const body = this.radius;
    const glow = lightOn ? 1 : 0.45;
    const speed = Math.hypot(this.vx, this.vy);
    const length = body * this.spec.length;
    const phase = this.bodyPhase + time * 0.0008;
    const hoverFactor = this.spec.realMotion === "hover" ? 0.58 : 1;
    const bend = body * (0.16 + speed * 1.05) * this.spec.undulation * hoverFactor;
    const yawDelta = Math.abs(angleDelta(this.bodyYaw, this.targetYaw));
    const turnAmount = Math.sin(Math.min(Math.PI, yawDelta));
    const turnBend = this.turnBend * 0.62 + Math.sign(angleDelta(this.tailYaw, this.headYaw) || this.turnIntent || 1) * turnAmount * 0.32;
    const points = buildFishSpine(body, length, phase, bend, turnBend, this.age, this.spec.depth, this.headYaw, this.bodyYaw, this.tailYaw, this.spine);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.visualPitch);

    if (this.courtship > 0 || this.interact > 0 || this.feedingHalo > 0) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = this.feedingHalo > 0 ? "#ffd45a" : this.courtship > 0 ? this.spec.accent : "#ff477e";
      ctx.beginPath();
      ctx.ellipse(0, 0, body * (1.55 - turnAmount * 0.32 + this.feedRush * 0.16), body * (1.05 + this.feedRush * 0.08), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawCaudalFin(this, points, body, phase, glow);
    drawSoftFins(this, points, body, phase, glow);

    drawRealFishBody(this, points, body, scale, glow);

    ctx.strokeStyle = `rgba(255, 255, 255, ${lightOn ? 0.18 : 0.08})`;
    ctx.lineWidth = Math.max(0.8, scale * 0.7);
    ctx.beginPath();
    for (let i = 0; i < points.length - 1; i += 1) {
      const p = points[i];
      if (i === 0) ctx.moveTo(p.x, p.y - p.width * 0.18);
      else ctx.lineTo(p.x, p.y - p.width * 0.18);
    }
    ctx.stroke();

    drawVolumetricEye(points[0], body, this.headYaw);

    ctx.restore();
  }
}

function buildFishSpine(body, length, phase, bend, turnBend, age, depth, headYaw, bodyYaw, tailYaw, points = []) {
  const segments = 10;
  const ageScale = 0.74 + age * 0.26;
  points.length = segments + 1;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const tailWeight = Math.pow(t, 1.45);
    const yaw = interpolateYaw(headYaw, bodyYaw, tailYaw, t);
    const side = Math.cos(yaw);
    const depthView = Math.sin(yaw);
    const x = (body * 1.05 - t * length * ageScale) * side;
    const turnCurve = Math.sin(t * Math.PI) * body * clamp(turnBend, -0.55, 0.55) * 0.42;
    const y = Math.sin(phase - t * 2.7) * bend * tailWeight + turnCurve;
    const bodyCurve = Math.sin((1 - t) * Math.PI * 0.92);
    const headMass = Math.max(0, 1 - t * 2.7) * 0.34;
    const width = body * (0.16 + bodyCurve * 0.72 + headMass) * ageScale * depth;
    const thickness = body * (0.15 + bodyCurve * 0.38 + headMass * 0.32) * ageScale;
    const point = points[i] || (points[i] = {});
    point.x = x;
    point.y = y;
    point.width = Math.max(body * 0.12, width * (0.2 + Math.abs(side) * 0.8));
    point.sideWidth = Math.max(body * 0.12, width);
    point.thickness = Math.max(body * 0.06, thickness * (0.24 + Math.abs(depthView) * 0.58));
    point.t = t;
    point.yaw = yaw;
    point.side = side;
    point.depthView = depthView;
  }

  return points;
}

function interpolateYaw(headYaw, bodyYaw, tailYaw, t) {
  if (t < 0.34) {
    return headYaw + angleDelta(headYaw, bodyYaw) * (t / 0.34);
  }
  return bodyYaw + angleDelta(bodyYaw, tailYaw) * ((t - 0.34) / 0.66);
}

function drawRealFishBody(f, points, body, scale, glow) {
  const head = points[0];
  const tail = points[points.length - 1];
  const palette = f.spec.bodyRgb;
  const upper = tintRgb(palette[0], lightOn ? 0.18 : -0.2);
  const middle = tintRgb(palette[1], lightOn ? 0.04 : -0.3);
  const lower = tintRgb(palette[2], lightOn ? -0.02 : -0.36);
  const gradient = ctx.createLinearGradient(head.x, -body, tail.x, body);
  gradient.addColorStop(0, rgbToCss(upper, 1));
  gradient.addColorStop(0.48, rgbToCss(middle, 1));
  gradient.addColorStop(1, rgbToCss(lower, 1));

  ctx.save();
  drawBodyHull(points, "far");
  ctx.fillStyle = rgbToCss(tintRgb(middle, -0.28), 0.72);
  ctx.fill();

  ctx.beginPath();
  drawBodyHull(points, "near");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.clip();

  drawFineScaleTexture(f, points, body, scale);
  drawLateralPearlLine(f, points, body, scale);

  ctx.globalAlpha = lightOn ? 0.18 : 0.08;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, scale * 1.1);
  ctx.beginPath();
  for (let i = 0; i < points.length - 2; i += 1) {
    const p = points[i];
    if (i === 0) ctx.moveTo(p.x, p.y - p.width * 0.42);
    else ctx.lineTo(p.x, p.y - p.width * 0.38);
  }
  ctx.stroke();

  ctx.globalAlpha = lightOn ? 0.2 : 0.1;
  ctx.strokeStyle = "#06161b";
  ctx.lineWidth = Math.max(0.7, scale * 0.8);
  for (let i = 2; i < points.length - 2; i += 2) {
    const p = points[i];
    ctx.beginPath();
    ctx.moveTo(p.x + body * 0.08, p.y - p.width * 0.58);
    ctx.quadraticCurveTo(p.x - body * 0.06, p.y, p.x + body * 0.06, p.y + p.width * 0.58);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.restore();

  const gill = points[1];
  ctx.strokeStyle = `rgba(7, 20, 24, ${lightOn ? 0.38 : 0.55})`;
  ctx.lineWidth = Math.max(0.9, scale * 1.1);
  ctx.beginPath();
  ctx.arc(gill.x - body * 0.12, gill.y, body * 0.34, -Math.PI * 0.45, Math.PI * 0.45);
  ctx.stroke();

  drawSpeciesPattern(f, body, scale, glow, points);
}

function drawBodyHull(points, sideName) {
  const sideSign = sideName === "near" ? 1 : -1;
  ctx.beginPath();
  traceBodySurface(points, sideSign, -1, 0, points.length, 1, true);
  traceBodySurface(points, sideSign, 1, points.length - 1, -1, -1, false);
  ctx.closePath();
}

function traceBodySurface(points, sideSign, verticalSign, start, end, step, moveFirst) {
  for (let index = start; index !== end; index += step) {
    const p = points[index];
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const invLen = 1 / (Math.hypot(dx, dy) || 1);
    const side = sideSign * Math.sign(Math.sin(p.yaw) || 1);
    const x = p.x - dy * invLen * p.width * verticalSign + side * p.thickness * 0.3;
    const y = p.y + dx * invLen * p.width * verticalSign + side * p.thickness * 0.1;
    if (index === start && moveFirst) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function surfacePointAt(points, index, offset) {
  const p = points[clamp(index, 0, points.length - 1)];
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: p.x + (-dy / len) * p.width * offset,
    y: p.y + (dx / len) * p.width * offset,
    width: p.width,
    t: p.t
  };
}

function detailNoise(kind, a, b = 0) {
  const x = Math.sin((kind + 1) * 127.1 + a * 311.7 + b * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawFineScaleTexture(f, points, body, scale) {
  const detail = f.spec.visualDetail;
  if (!detail || detail.scales <= 0.08) return;

  const bodySide = Math.abs(Math.cos(points[3].yaw));
  const alphaBase = (lightOn ? 0.2 : 0.1) * detail.scales * (0.4 + bodySide * 0.6);
  const rows = f.spec.realMotion === "loach" ? [-0.18, 0.12] : [-0.42, -0.22, -0.02, 0.2, 0.42];
  const step = f.spec.size < 8 ? 2 : 1;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.34, scale * 0.38);
  for (let i = 2; i < points.length - 2; i += step) {
    for (let r = 0; r < rows.length; r += 1) {
      const jitter = (detailNoise(f.kind, i, r) - 0.5) * 0.06;
      const p = surfacePointAt(points, i, rows[r] + jitter);
      const size = Math.max(0.75, body * (0.045 + detail.scales * 0.014));
      const shine = detailNoise(f.kind, i * 2, r) > 0.52 ? 1 : 0.52;

      ctx.strokeStyle = `rgba(255, 255, 255, ${alphaBase * shine})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, -Math.PI * 0.14, Math.PI * 0.92);
      ctx.stroke();

      ctx.strokeStyle = `rgba(5, 15, 18, ${alphaBase * 0.42})`;
      ctx.beginPath();
      ctx.arc(p.x + scale * 0.25, p.y + scale * 0.16, size * 0.9, Math.PI * 0.72, Math.PI * 1.2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLateralPearlLine(f, points, body, scale) {
  const detail = f.spec.visualDetail;
  const intensity = detail ? detail.pearlescence : 0.45;
  if (intensity <= 0.12) return;

  const accent = f.spec.accentRgb;
  const glowColor = tintRgb(accent, lightOn ? 0.34 : -0.18);
  ctx.save();
  ctx.globalAlpha = (lightOn ? 0.22 : 0.1) * intensity;
  ctx.strokeStyle = rgbToCss(glowColor, 1);
  ctx.lineWidth = Math.max(0.62, scale * 0.52);
  ctx.beginPath();
  for (let i = 1; i < points.length - 2; i += 1) {
    const p = surfacePointAt(points, i, -0.05 + Math.sin(i * 0.7 + f.kind) * 0.025);
    if (i === 1) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  const dotStep = f.spec.size < 8 ? 2 : 1;
  for (let i = 2; i < points.length - 3; i += dotStep) {
    if (detailNoise(f.kind, i, 9) < 0.34) continue;
    const p = surfacePointAt(points, i, -0.1 + (detailNoise(f.kind, i, 3) - 0.5) * 0.18);
    ctx.fillStyle = rgbToCss(tintRgb(accent, 0.48), 0.58);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.42, scale * 0.42), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVolumetricEye(head, body, yaw) {
  const side = Math.cos(yaw);
  const depth = Math.sin(yaw);
  const visible = Math.max(0, Math.abs(side) * 0.95 + 0.05);
  const near = Math.sign(depth || side || 1);
  const x = head.x + side * body * 0.05 + near * head.thickness * 0.32;
  const y = head.y - body * (0.18 + Math.abs(depth) * 0.04);

  if (visible < 0.18) {
    ctx.strokeStyle = `rgba(8, 18, 22, ${0.42 + lightOn * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(head.x - body * 0.08, y);
    ctx.lineTo(head.x + body * 0.12, y);
    ctx.stroke();
    return;
  }

  ctx.globalAlpha = visible;
  ctx.fillStyle = "#081018";
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1.15, body * 0.1 * visible), Math.max(1.2, body * 0.11), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x + body * 0.03 * Math.sign(side || 1), y - body * 0.035, Math.max(0.45, body * 0.03), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawCaudalFin(f, points, body, phase, glow) {
  const tail = points[points.length - 1];
  const before = points[points.length - 3];
  const dx = tail.x - before.x;
  const dy = tail.y - before.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const nx = -ty;
  const ny = tx;
  const flick = Math.sin(phase - 2.6) * body * (0.42 + f.spec.undulation * 0.2);
  const veilBoost = f.spec.tailShape === "veil" || f.spec.tailShape === "fan" ? 1.18 : 1;
  const yawSide = Math.abs(Math.cos(tail.yaw));
  const yawDepth = Math.abs(Math.sin(tail.yaw));
  const tailLong = body * f.spec.tailSize * (f.spec.realMotion === "hover" ? 1.25 : 1) * veilBoost * (0.28 + yawSide * 0.72);
  const tailHigh = body * f.spec.tailSize * (f.spec.tailShape === "fork" || f.spec.tailShape === "tiny" ? 0.62 : 0.94) * (0.52 + yawSide * 0.48);
  const depthOffset = Math.sign(Math.sin(tail.yaw) || 1) * tail.thickness * (0.28 + yawDepth * 0.34);

  ctx.fillStyle = shade(f.spec.accent, glow);
  ctx.globalAlpha = (f.spec.realMotion === "hover" ? 0.72 : 0.82) * (0.34 + yawSide * 0.66);
  ctx.beginPath();
  if (f.spec.tailShape === "fork") {
    ctx.moveTo(tail.x + depthOffset + nx * tail.width * 0.28, tail.y + ny * tail.width * 0.28);
    ctx.quadraticCurveTo(tail.x + depthOffset + tx * tailLong * 0.62 + nx * tailHigh, tail.y + ty * tailLong * 0.62 + ny * tailHigh, tail.x + depthOffset + tx * tailLong + nx * (tailHigh * 0.52 + flick), tail.y + ty * tailLong + ny * (tailHigh * 0.52 + flick));
    ctx.lineTo(tail.x + depthOffset + tx * tailLong * 0.66 + nx * flick * 0.12, tail.y + ty * tailLong * 0.66 + ny * flick * 0.12);
    ctx.lineTo(tail.x + depthOffset + tx * tailLong - nx * (tailHigh * 0.52 - flick), tail.y + ty * tailLong - ny * (tailHigh * 0.52 - flick));
    ctx.quadraticCurveTo(tail.x + depthOffset + tx * tailLong * 0.62 - nx * tailHigh, tail.y + ty * tailLong * 0.62 - ny * tailHigh, tail.x + depthOffset - nx * tail.width * 0.28, tail.y - ny * tail.width * 0.28);
  } else if (f.spec.tailShape === "sword") {
    ctx.moveTo(tail.x + depthOffset + nx * tail.width * 0.28, tail.y + ny * tail.width * 0.28);
    ctx.quadraticCurveTo(tail.x + depthOffset + tx * tailLong * 0.62 + nx * tailHigh * 0.78, tail.y + ty * tailLong * 0.62 + ny * tailHigh * 0.78, tail.x + depthOffset + tx * tailLong * 0.9 + nx * flick, tail.y + ty * tailLong * 0.9 + ny * flick);
    ctx.lineTo(tail.x + depthOffset + tx * tailLong * 1.42 - nx * tailHigh * 0.34, tail.y + ty * tailLong * 1.42 - ny * tailHigh * 0.34);
    ctx.quadraticCurveTo(tail.x + depthOffset + tx * tailLong * 0.5 - nx * tailHigh, tail.y + ty * tailLong * 0.5 - ny * tailHigh, tail.x + depthOffset - nx * tail.width * 0.28, tail.y - ny * tail.width * 0.28);
  } else {
    ctx.moveTo(tail.x + depthOffset + nx * tail.width * 0.34, tail.y + ny * tail.width * 0.34);
    ctx.quadraticCurveTo(tail.x + depthOffset + tx * tailLong * 0.72 + nx * (tailHigh + flick), tail.y + ty * tailLong * 0.72 + ny * (tailHigh + flick), tail.x + depthOffset + tx * tailLong + nx * flick, tail.y + ty * tailLong + ny * flick);
    ctx.quadraticCurveTo(tail.x + depthOffset + tx * tailLong * 0.72 - nx * (tailHigh - flick), tail.y + ty * tailLong * 0.72 - ny * (tailHigh - flick), tail.x + depthOffset - nx * tail.width * 0.34, tail.y - ny * tail.width * 0.34);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 255, 255, ${(lightOn ? 0.28 : 0.1) * (0.35 + yawSide * 0.65)})`;
  ctx.lineWidth = Math.max(0.55, body * 0.045);
  const finVeins = f.spec.visualDetail ? f.spec.visualDetail.finVeins : 0.7;
  const rayCount = clamp(Math.round(3 + finVeins * 4), 3, 9);
  for (let r = 0; r < rayCount; r += 1) {
    const i = rayCount === 1 ? 0 : -1 + (r / (rayCount - 1)) * 2;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(tail.x + depthOffset + tx * tailLong * 0.88 + nx * flick * 0.45 + nx * i * tailHigh * 0.46, tail.y + ty * tailLong * 0.88 + ny * flick * 0.45 + ny * i * tailHigh * 0.46);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawSoftFins(f, points, body, phase, glow) {
  const mid = points[4];
  const chest = points[2];
  const finBeat = Math.sin(phase * 1.55 + f.pectoralPhase) * body * 0.18;
  const hoverFin = f.spec.realMotion === "hover" || f.spec.realMotion === "disk" || f.spec.realMotion === "sail";
  const finScale = hoverFin ? 1.28 : f.spec.realMotion === "bottom" || f.spec.realMotion === "sucker" ? 0.72 : 1;
  const bodySide = Math.abs(Math.cos(chest.yaw));
  const near = Math.sign(Math.sin(chest.yaw) || 1);
  const nearOffset = near * chest.thickness * 0.34;
  const farOffset = -near * chest.thickness * 0.22;

  ctx.fillStyle = shade(f.spec.body[2], glow);
  ctx.globalAlpha = (hoverFin ? 0.48 : 0.34) * (0.45 + bodySide * 0.55);
  ctx.beginPath();
  ctx.moveTo(mid.x + farOffset - body * 0.1, mid.y - mid.width * 0.68);
  ctx.quadraticCurveTo(mid.x + farOffset - body * 0.2, mid.y - mid.width * (1.0 + finScale * 0.24) - finBeat, mid.x + farOffset - body * (0.58 + finScale * 0.12), mid.y - mid.width * 0.5);
  ctx.quadraticCurveTo(mid.x + farOffset - body * 0.36, mid.y - mid.width * 0.42, mid.x + farOffset - body * 0.1, mid.y - mid.width * 0.68);
  ctx.fill();
  drawFinVeins(
    mid.x + farOffset - body * 0.1,
    mid.y - mid.width * 0.62,
    mid.x + farOffset - body * (0.5 + finScale * 0.12),
    mid.y - mid.width * (0.76 + finScale * 0.18) - finBeat * 0.55,
    body,
    f.spec.visualDetail ? f.spec.visualDetail.finVeins : 0.7
  );

  ctx.fillStyle = shade(f.spec.accent, glow);
  ctx.globalAlpha = 0.64 * (0.38 + bodySide * 0.62);
  ctx.beginPath();
  ctx.moveTo(chest.x + nearOffset - body * 0.08, chest.y + chest.width * 0.35);
  ctx.quadraticCurveTo(chest.x + nearOffset + body * 0.38, chest.y + chest.width * (0.72 + finScale * 0.26) + finBeat, chest.x + nearOffset + body * (0.62 + finScale * 0.16), chest.y + chest.width * 0.24);
  ctx.quadraticCurveTo(chest.x + nearOffset + body * 0.32, chest.y + chest.width * 0.34, chest.x + nearOffset - body * 0.08, chest.y + chest.width * 0.35);
  ctx.fill();
  drawFinVeins(
    chest.x + nearOffset,
    chest.y + chest.width * 0.38,
    chest.x + nearOffset + body * (0.5 + finScale * 0.14),
    chest.y + chest.width * (0.52 + finScale * 0.18) + finBeat * 0.45,
    body,
    f.spec.visualDetail ? f.spec.visualDetail.finVeins : 0.7
  );

  if (f.spec.realMotion === "hover" || f.spec.realMotion === "sail") {
    ctx.strokeStyle = shade(f.spec.accent, glow);
    ctx.globalAlpha = 0.5 * (0.35 + bodySide * 0.65);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chest.x + nearOffset - body * 0.1, chest.y + chest.width * 0.42);
    ctx.quadraticCurveTo(chest.x + nearOffset - body * 0.04, chest.y + chest.width * 1.4, chest.x + nearOffset + body * 0.18, chest.y + chest.width * 2.1);
    ctx.moveTo(chest.x + nearOffset + body * 0.14, chest.y + chest.width * 0.36);
    ctx.quadraticCurveTo(chest.x + nearOffset + body * 0.12, chest.y + chest.width * 1.3, chest.x + nearOffset + body * 0.38, chest.y + chest.width * 1.95);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawFinVeins(x1, y1, x2, y2, body, density) {
  const count = clamp(Math.round(2 + density * 4), 3, 8);
  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${lightOn ? 0.18 : 0.08})`;
  ctx.lineWidth = Math.max(0.45, body * 0.032);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const curve = (t - 0.5) * body * 0.16;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + curve, x2 + curve * 0.8, y2 + curve * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

function drawJellyfish(f, time) {
  const body = f.radius;
  const spec = f.spec;
  const jelly = spec.jelly;
  const glow = lightOn ? 1 : 0.46;
  const pulse = Math.pow(Math.max(0, Math.sin(f.jellyPulse)), 2.2);
  const relax = 1 - pulse;
  const bellW = body * jelly.bell * (1.04 - pulse * 0.1 + relax * 0.06);
  const bellH = body * (1.08 + pulse * 0.1);
  const skirtY = bellH * (0.22 + pulse * 0.08);
  const tilt = Math.sin(f.wander * 0.55 + f.tentacleSeed) * 0.08;
  const primary = shade(spec.body[0], glow);
  const mid = shade(spec.body[1], glow);
  const pale = shade(spec.body[2], glow);
  const vividAlpha = lightOn ? 1 : 0.62;

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(tilt);

  if (f.feedingHalo > 0 || f.interact > 0) {
    ctx.globalAlpha = (f.feedingHalo > 0 ? 0.18 : 0.12) * Math.max(f.feedingHalo, f.interact);
    ctx.fillStyle = f.feedingHalo > 0 ? "#ffe071" : spec.accent;
    ctx.beginPath();
    ctx.ellipse(0, bellH * 0.22, bellW * 1.15, bellH * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = vividAlpha * 0.2;
  ctx.fillStyle = shade(spec.accent, glow);
  ctx.beginPath();
  ctx.ellipse(0, -bellH * 0.08, bellW * 1.12, bellH * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawJellyTentacles(f, body, bellW, bellH, pulse, time, false);

  const gradient = ctx.createRadialGradient(-bellW * 0.24, -bellH * 0.34, body * 0.08, 0, -bellH * 0.08, bellW * 1.1);
  gradient.addColorStop(0, rgbToCss(tintRgb(hexToRgb(spec.body[2]), 0.24), 0.96 * jelly.translucency));
  gradient.addColorStop(0.38, rgbToCss(tintRgb(hexToRgb(spec.body[0]), 0.06), 1.0 * jelly.translucency));
  gradient.addColorStop(0.72, rgbToCss(tintRgb(hexToRgb(spec.body[1]), 0.02), 0.82 * jelly.translucency));
  gradient.addColorStop(1, rgbToCss(tintRgb(hexToRgb(spec.body[1]), -0.12), 0.54 * jelly.translucency));

  ctx.globalAlpha = 1;
  ctx.fillStyle = gradient;
  traceJellyBellPath(bellW, bellH, skirtY, pulse, body);
  ctx.fill();

  drawJellyInnerGlow(f, body, bellW, bellH, pulse);

  ctx.strokeStyle = rgbToCss(tintRgb(hexToRgb(spec.body[2]), 0.18), lightOn ? 0.78 : 0.36);
  ctx.lineWidth = Math.max(0.85, body * 0.065);
  traceJellyBellTop(bellW, bellH);
  ctx.stroke();

  ctx.strokeStyle = rgbToCss(tintRgb(hexToRgb(spec.accent), 0.12), lightOn ? 0.52 : 0.24);
  ctx.lineWidth = Math.max(0.55, body * 0.045);
  ctx.beginPath();
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const x = -bellW * 0.66 + t * bellW * 1.32;
    const y = skirtY + body * (0.02 + Math.sin(t * Math.PI * 10 + f.jellyPulse) * 0.03);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = rgbToCss(tintRgb(hexToRgb(spec.stripe), 0.2), lightOn ? 0.28 : 0.16);
  ctx.lineWidth = Math.max(0.55, body * 0.045);
  for (let i = 0; i < jelly.radialLines; i += 1) {
    const a = -Math.PI + (i / Math.max(1, jelly.radialLines - 1)) * Math.PI;
    const inner = body * (0.12 + detailNoise(f.kind, i, 3) * 0.06);
    const outer = bellW * (0.84 + detailNoise(f.kind, i, 5) * 0.08);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * bellH * 0.18);
    ctx.quadraticCurveTo(Math.cos(a) * outer * 0.46, Math.sin(a) * bellH * 0.62, Math.cos(a) * outer, Math.sin(a) * bellH * 0.96);
    ctx.stroke();
  }

  for (let r = 1; r <= jelly.rings; r += 1) {
    ctx.strokeStyle = rgbToCss(tintRgb(hexToRgb(spec.accent), 0.18), (lightOn ? 0.22 : 0.12) * (1 - r * 0.08));
    ctx.lineWidth = Math.max(0.42, body * 0.032);
    ctx.beginPath();
    ctx.ellipse(0, -bellH * 0.05 + r * body * 0.08, bellW * (0.22 + r * 0.16), bellH * (0.14 + r * 0.1), 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  drawJellyPattern(f, body, bellW, bellH, pulse, primary, mid, pale);
  drawJellyRibbonArms(f, body, bellW, bellH, pulse, time);
  drawJellyOralArms(f, body, bellW, bellH, pulse, time);
  drawJellyTentacles(f, body, bellW, bellH, pulse, time, true);

  ctx.restore();
}

function drawJellyInnerGlow(f, body, bellW, bellH, pulse) {
  const spec = f.spec;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = lightOn ? 0.34 : 0.16;
  const glow = ctx.createRadialGradient(0, -bellH * 0.22, body * 0.08, 0, -bellH * 0.05, bellW * 0.82);
  glow.addColorStop(0, rgbToCss(tintRgb(hexToRgb(spec.body[2]), 0.3), 0.72));
  glow.addColorStop(0.42, rgbToCss(tintRgb(hexToRgb(spec.accent), 0.12), 0.46));
  glow.addColorStop(1, rgbToCss(hexToRgb(spec.body[1]), 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, -bellH * 0.18, bellW * 0.76, bellH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = lightOn ? 0.42 : 0.2;
  ctx.strokeStyle = rgbToCss(tintRgb(hexToRgb(spec.accent), 0.28), 1);
  ctx.lineWidth = Math.max(0.45, body * 0.04);
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.ellipse(i * body * 0.18, -bellH * 0.2 + Math.abs(i) * body * 0.02, body * 0.22, body * 0.1, i * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function traceJellyBellPath(bellW, bellH, skirtY, pulse, body) {
  const rimW = bellW * (0.66 - pulse * 0.08);
  const shoulderW = bellW * (0.96 - pulse * 0.05);
  ctx.beginPath();
  ctx.moveTo(-rimW, skirtY);
  ctx.bezierCurveTo(-shoulderW, -bellH * 0.08, -bellW * 0.62, -bellH * 0.86, 0, -bellH);
  ctx.bezierCurveTo(bellW * 0.62, -bellH * 0.86, shoulderW, -bellH * 0.08, rimW, skirtY);
  ctx.bezierCurveTo(rimW * 0.58, skirtY + body * (0.12 + pulse * 0.08), rimW * 0.2, skirtY + body * (0.18 + pulse * 0.14), 0, skirtY + body * (0.16 + pulse * 0.18));
  ctx.bezierCurveTo(-rimW * 0.2, skirtY + body * (0.18 + pulse * 0.14), -rimW * 0.58, skirtY + body * (0.12 + pulse * 0.08), -rimW, skirtY);
  ctx.closePath();
}

function traceJellyBellTop(bellW, bellH) {
  ctx.beginPath();
  ctx.moveTo(-bellW * 0.72, 0);
  ctx.bezierCurveTo(-bellW * 0.78, -bellH * 0.46, -bellW * 0.48, -bellH * 0.9, 0, -bellH);
  ctx.bezierCurveTo(bellW * 0.48, -bellH * 0.9, bellW * 0.78, -bellH * 0.46, bellW * 0.72, 0);
}

function drawJellyPattern(f, body, bellW, bellH, pulse, primary, mid, pale) {
  const pattern = f.spec.pattern;
  const accent = shade(f.spec.accent, lightOn ? 1 : 0.46);
  ctx.save();
  if (pattern === "moonJelly" || pattern === "crystalJelly") {
    ctx.globalAlpha = pattern === "crystalJelly" ? 0.36 : 0.44;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(0.7, body * 0.06);
    for (let i = 0; i < 4; i += 1) {
      const a = i * Math.PI * 0.5 + f.tentacleSeed;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * body * 0.28, Math.sin(a) * body * 0.18 - bellH * 0.12, body * 0.18, body * 0.1, a, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (pattern === "spottedJelly" || pattern === "flowerHat" || pattern === "friedEggJelly" || pattern === "crownJelly") {
    ctx.fillStyle = pattern === "flowerHat" ? accent : shade(f.spec.stripe, lightOn ? 1 : 0.46);
    ctx.globalAlpha = pattern === "flowerHat" || pattern === "crownJelly" ? 0.68 : 0.5;
    const count = pattern === "flowerHat" || pattern === "crownJelly" ? 18 : 26;
    for (let i = 0; i < count; i += 1) {
      const a = detailNoise(f.kind, i, 2) * Math.PI;
      const rr = bellW * (0.18 + detailNoise(f.kind, i, 4) * 0.7);
      const x = Math.cos(-Math.PI + a) * rr;
      const y = -bellH * 0.1 - Math.sin(a) * bellH * (0.16 + detailNoise(f.kind, i, 8) * 0.64);
      ctx.beginPath();
      ctx.arc(x, y, body * (0.035 + detailNoise(f.kind, i, 5) * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
    if (pattern === "friedEggJelly") {
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = shade("#ff7b1f", lightOn ? 1 : 0.46);
      ctx.beginPath();
      ctx.ellipse(0, -bellH * 0.18, body * 0.52, body * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "compassJelly" || pattern === "purpleStripeJelly" || pattern === "seaNettle" || pattern === "mauveStinger") {
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = shade(f.spec.stripe, lightOn ? 1 : 0.46);
    ctx.lineWidth = Math.max(0.65, body * 0.055);
    const rays = pattern === "compassJelly" ? 8 : 10;
    for (let i = 0; i < rays; i += 1) {
      const a = -Math.PI + (i + 0.5) * (Math.PI / rays);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * body * 0.16, -bellH * 0.06);
      ctx.quadraticCurveTo(Math.cos(a) * bellW * 0.38, -bellH * 0.34, Math.cos(a) * bellW * 0.78, -bellH * 0.1 + Math.sin(a) * bellH * 0.28);
      ctx.stroke();
    }
  } else if (pattern === "blueBlubber" || pattern === "lagoonJelly") {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = pale;
    for (let i = 0; i < 8; i += 1) {
      const a = i * Math.PI * 0.25;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * body * 0.42, Math.sin(a) * body * 0.16 - bellH * 0.02, body * 0.12, body * 0.05, a, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "upsideDown") {
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(0.6, body * 0.045);
    for (let i = -3; i <= 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * body * 0.16, -bellH * 0.34);
      ctx.quadraticCurveTo(i * body * 0.26, -bellH * 0.08, i * body * 0.18, bellH * 0.36 + pulse * body * 0.08);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawJellyOralArms(f, body, bellW, bellH, pulse, time) {
  const jelly = f.spec.jelly;
  const count = jelly.oralArms;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgbToCss(tintRgb(f.spec.accentRgb, 0.18), lightOn ? 0.56 : 0.28);
  ctx.lineWidth = Math.max(0.55, body * 0.052);
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const baseX = (t - 0.5) * bellW * 0.34;
    const len = body * (1.15 + f.spec.jelly.drift * 0.68 + detailNoise(f.kind, i, 18) * 0.56) * (1 - pulse * 0.12);
    const phase = time * 0.0015 + f.tentacleSeed + i * 0.8;
    ctx.beginPath();
    ctx.moveTo(baseX, bellH * 0.22);
    ctx.bezierCurveTo(baseX + Math.sin(phase) * body * 0.16, bellH * 0.54, baseX + Math.sin(phase + 0.8) * body * 0.28, bellH * 0.68 + len * 0.35, baseX + Math.sin(phase + 1.5) * body * 0.34, bellH * 0.24 + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawJellyRibbonArms(f, body, bellW, bellH, pulse, time) {
  const jelly = f.spec.jelly;
  const count = Math.max(3, Math.min(8, jelly.oralArms));
  const accent = f.spec.accentRgb;
  const stripe = f.spec.stripeRgb;
  ctx.save();
  ctx.globalAlpha = lightOn ? 0.38 : 0.2;
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const baseX = (t - 0.5) * bellW * 0.32;
    const side = t < 0.5 ? -1 : 1;
    const phase = time * 0.00125 + f.tentacleSeed + i * 0.7;
    const len = body * (0.78 + jelly.drift * 0.44 + detailNoise(f.kind, i, 31) * 0.36);
    const width = body * (0.1 + detailNoise(f.kind, i, 32) * 0.05);

    const color = i % 2 === 0 ? accent : stripe;
    ctx.fillStyle = rgbToCss(tintRgb(color, 0.12), lightOn ? 0.62 : 0.3);
    ctx.beginPath();
    ctx.moveTo(baseX - width * 0.45, bellH * 0.25);
    ctx.bezierCurveTo(
      baseX + Math.sin(phase) * body * 0.18 - width,
      bellH * 0.58,
      baseX + side * body * 0.2 + Math.sin(phase + 0.8) * body * 0.22 - width * 0.4,
      bellH * 0.46 + len * 0.62,
      baseX + side * body * 0.12 + Math.sin(phase + 1.6) * body * 0.32,
      bellH * 0.34 + len
    );
    ctx.bezierCurveTo(
      baseX + side * body * 0.16 + Math.sin(phase + 1.2) * body * 0.22 + width,
      bellH * 0.44 + len * 0.64,
      baseX + Math.sin(phase + 0.4) * body * 0.16 + width,
      bellH * 0.58,
      baseX + width * 0.45,
      bellH * 0.25
    );
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgbToCss(tintRgb(color, 0.28), lightOn ? 0.58 : 0.28);
    ctx.lineWidth = Math.max(0.45, body * 0.028);
    ctx.beginPath();
    ctx.moveTo(baseX, bellH * 0.28);
    ctx.bezierCurveTo(baseX + Math.sin(phase) * body * 0.14, bellH * 0.56, baseX + Math.sin(phase + 0.9) * body * 0.22, bellH * 0.48 + len * 0.62, baseX + Math.sin(phase + 1.8) * body * 0.3, bellH * 0.34 + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawJellyTentacles(f, body, bellW, bellH, pulse, time, front) {
  const jelly = f.spec.jelly;
  const count = jelly.tentacles;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = rgbToCss(tintRgb(f.spec.stripeRgb, front ? 0.28 : -0.05), (front ? 0.42 : 0.22) * (lightOn ? 1 : 0.58));
  ctx.lineWidth = Math.max(0.42, body * (front ? 0.038 : 0.028));
  const start = front ? 0 : 1;
  for (let i = start; i < count; i += 2) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const edge = -bellW * 0.62 + t * bellW * 1.24;
    const edgeCurve = Math.sin(t * Math.PI);
    const baseY = bellH * (0.28 + edgeCurve * 0.12);
    const len = body * (1.35 + jelly.drift * 0.98 + detailNoise(f.kind, i, 11) * 0.85) * (1 - pulse * 0.18);
    const phase = time * 0.002 + f.tentacleSeed + i * 0.44;
    ctx.beginPath();
    ctx.moveTo(edge, baseY);
    ctx.bezierCurveTo(edge + Math.sin(phase) * body * 0.16, baseY + len * 0.28, edge + Math.sin(phase + 1.2) * body * 0.34, baseY + len * 0.68, edge + Math.sin(phase + 2.1) * body * 0.5, baseY + len);
    ctx.stroke();

    if (front && i % 4 === 0) {
      const glowX = edge + Math.sin(phase + 1.3) * body * 0.28;
      const glowY = baseY + len * (0.46 + detailNoise(f.kind, i, 23) * 0.32);
      ctx.fillStyle = rgbToCss(tintRgb(f.spec.accentRgb, 0.35), lightOn ? 0.42 : 0.18);
      ctx.beginPath();
      ctx.arc(glowX, glowY, Math.max(0.45, body * 0.034), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * amount + 8, 0, 255);
  const g = clamp(((n >> 8) & 255) * amount + 8, 0, 255);
  const b = clamp((n & 255) * amount + 8, 0, 255);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixRgb(a, b, t) {
  const m = clamp(t, 0, 1);
  return {
    r: a.r + (b.r - a.r) * m,
    g: a.g + (b.g - a.g) * m,
    b: a.b + (b.b - a.b) * m
  };
}

function tintRgb(color, amount) {
  if (amount >= 0) {
    return mixRgb(color, { r: 255, g: 255, b: 255 }, amount);
  }
  return mixRgb(color, { r: 0, g: 0, b: 0 }, -amount);
}

function rgbToCss(color, alpha = 1) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
}

function drawSpeciesPattern(f, body, scale, glow, points) {
  ctx.strokeStyle = shade(f.spec.stripe, glow);
  ctx.lineWidth = Math.max(1, scale * 1.2);
  ctx.lineCap = "round";

  const strokeBodyLine = (offset, color, width = 1) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 1; i < points.length - 2; i += 1) {
      const p = points[i];
      const y = p.y + p.width * offset;
      if (i === 1) ctx.moveTo(p.x, y);
      else ctx.lineTo(p.x, y);
    }
    ctx.stroke();
  };

  const drawBand = (index, color, alpha = 0.62, widthScale = 0.2) => {
    const p = points[clamp(index, 1, points.length - 3)];
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, body * widthScale, p.width * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  const pattern = f.spec.pattern;

  if (pattern === "neon" || pattern === "cardinal") {
    strokeBodyLine(-0.22, shade(f.spec.stripe, glow), Math.max(1.4, scale * 1.4));
    strokeBodyLine(0.22, shade("#ff3d72", glow), Math.max(1.1, scale));
  } else if (pattern === "zebra") {
    strokeBodyLine(-0.28, shade(f.spec.stripe, glow), Math.max(1, scale));
    strokeBodyLine(0.02, shade(f.spec.stripe, glow), Math.max(1, scale));
    strokeBodyLine(0.3, shade(f.spec.stripe, glow), Math.max(1, scale));
  } else if (pattern === "goldStripe" || pattern === "sideStripe") {
    strokeBodyLine(-0.04, shade(f.spec.stripe, glow), Math.max(1, scale * 1.2));
  } else if (pattern === "emperor") {
    strokeBodyLine(-0.16, shade("#2a173f", glow), Math.max(1.2, scale * 1.25));
    strokeBodyLine(0.16, shade(f.spec.accent, glow), Math.max(0.75, scale * 0.82));
    drawBand(7, shade("#141624", glow), 0.55, 0.18);
  } else if (pattern === "congo") {
    strokeBodyLine(-0.2, shade("#8df5e6", glow), Math.max(1, scale * 1.1));
    strokeBodyLine(0.02, shade("#f0d586", glow), Math.max(1.2, scale * 1.35));
    strokeBodyLine(0.25, shade("#8a75d6", glow), Math.max(0.9, scale));
  } else if (pattern === "glassCat") {
    ctx.globalAlpha = 0.42;
    strokeBodyLine(0.0, shade("#f7ffff", glow), Math.max(1, scale * 0.95));
    ctx.globalAlpha = 0.26;
    for (let i = 2; i < points.length - 3; i += 2) {
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.8, body * 0.055), 0, Math.PI * 2);
      ctx.fillStyle = shade("#efffff", glow);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === "rainbow") {
    strokeBodyLine(-0.2, shade("#52c8ff", glow), Math.max(1, scale * 1.05));
    strokeBodyLine(0.0, shade("#ffe08a", glow), Math.max(1.15, scale * 1.22));
    drawBand(6, shade("#f0673f", glow), 0.36, 0.2);
  } else if (pattern === "blueEye") {
    strokeBodyLine(-0.04, shade(f.spec.stripe, glow), Math.max(1, scale * 1.05));
    ctx.fillStyle = shade("#7deaff", glow);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(points[1].x + body * 0.18, points[1].y - body * 0.14, Math.max(0.8, body * 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (pattern === "wedge") {
    const p = points[4];
    ctx.fillStyle = shade(f.spec.stripe, glow);
    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.moveTo(points[3].x, points[3].y - points[3].width * 0.48);
    ctx.lineTo(points[7].x, points[7].y - points[7].width * 0.12);
    ctx.lineTo(points[7].x, points[7].y + points[7].width * 0.7);
    ctx.lineTo(p.x, p.y + p.width * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (pattern === "rummy") {
    drawBand(1, shade("#e9433f", glow), 0.68, 0.36);
    strokeBodyLine(0.0, shade("#e9e9dc", glow), Math.max(0.8, scale * 0.8));
  } else if (pattern === "verticalBars" || pattern === "tigerBars" || pattern === "gouramiBars") {
    const bars = pattern === "verticalBars" ? [2, 4, 6] : [2, 4, 6, 8];
    for (const index of bars) drawBand(index, shade(f.spec.stripe, glow), pattern === "gouramiBars" ? 0.42 : 0.62, 0.16);
  } else if (pattern === "veil" || pattern === "maze") {
    ctx.globalAlpha = 0.72;
    for (let i = -2; i <= 2; i += 1) {
      strokeBodyLine(i * 0.13, i % 2 === 0 ? shade(f.spec.stripe, glow) : shade(f.spec.accent, glow), Math.max(0.75, scale * 0.72));
    }
    ctx.globalAlpha = 1;
  } else if (pattern === "pearl" || pattern === "pepper" || pattern === "pleco") {
    ctx.fillStyle = shade(pattern === "pepper" ? "#32383b" : f.spec.stripe, glow);
    ctx.globalAlpha = pattern === "pleco" ? 0.38 : 0.58;
    for (let i = 2; i < points.length - 2; i += 1) {
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(i * 2.1) * body * 0.18, p.y + Math.cos(i * 1.7) * p.width * 0.42, Math.max(0.7, body * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === "ram") {
    ctx.fillStyle = shade("#202431", glow);
    ctx.globalAlpha = 0.58;
    drawBand(4, shade("#202431", glow), 0.58, 0.18);
    ctx.globalAlpha = 1;
    const cheek = points[2];
    ctx.strokeStyle = shade("#4ecdc4", glow);
    ctx.lineWidth = Math.max(1, scale * 1.1);
    ctx.beginPath();
    ctx.arc(cheek.x + body * 0.06, cheek.y - body * 0.14, body * 0.24, -Math.PI * 0.2, Math.PI * 1.25);
    ctx.stroke();
    ctx.fillStyle = shade("#ff6b6b", glow);
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.arc(cheek.x + body * 0.28, cheek.y + body * 0.08, body * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (pattern === "skirt") {
    drawBand(3, shade(f.spec.stripe, glow), 0.5, 0.14);
    drawBand(5, shade(f.spec.stripe, glow), 0.45, 0.12);
  } else if (pattern === "sword") {
    strokeBodyLine(0.18, shade(f.spec.stripe, glow), Math.max(0.8, scale));
  } else if (pattern === "loachBands") {
    for (const index of [1, 2, 4, 6, 8]) drawBand(index, shade(f.spec.stripe, glow), 0.65, 0.13);
  } else if (pattern === "koi") {
    for (const index of [2, 5, 7]) drawBand(index, shade(index === 7 ? "#1d2529" : f.spec.stripe, glow), 0.5, 0.3);
  } else if (pattern === "redTail") {
    strokeBodyLine(-0.02, shade("#101419", glow), Math.max(1.05, scale * 1.1));
    drawBand(7, shade("#f3483d", glow), 0.48, 0.16);
  } else if (pattern === "fox") {
    strokeBodyLine(0.02, shade("#20231e", glow), Math.max(1.35, scale * 1.38));
    strokeBodyLine(-0.24, shade("#f1dfb5", glow), Math.max(0.65, scale * 0.72));
  } else if (pattern === "algaeEater") {
    strokeBodyLine(-0.08, shade("#f6d76e", glow), Math.max(0.8, scale));
    ctx.globalAlpha = 0.34;
    for (const index of [3, 5, 7]) drawBand(index, shade("#8c6a2e", glow), 0.34, 0.11);
    ctx.globalAlpha = 1;
  } else if (pattern === "tailSpots" || pattern === "goldfish" || pattern === "molly" || pattern === "plain") {
    if (pattern === "tailSpots") {
      ctx.fillStyle = shade("#ffffff", glow);
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 4; i += 1) {
        const p = points[2 + i];
        ctx.beginPath();
        ctx.arc(p.x, p.y + Math.sin(i) * body * 0.18, body * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  } else {
    strokeBodyLine(0.0, shade(f.spec.stripe, glow), Math.max(0.75, scale * 0.75));
  }

  drawSpeciesMicroDetails(f, body, scale, glow, points);
}

function drawSpeciesMicroDetails(f, body, scale, glow, points) {
  const detail = f.spec.visualDetail;
  if (!detail) return;

  const amount = detail.microSpots;
  const pattern = f.spec.pattern;
  const dotColor =
    pattern === "molly" || pattern === "redTail" || pattern === "fox"
      ? "#f7e8b4"
      : pattern === "pepper" || pattern === "pleco" || pattern === "algaeEater"
        ? f.spec.stripe
        : f.spec.accent;
  const alpha = (lightOn ? 0.5 : 0.26) * amount;
  if (alpha > 0.025) {
    ctx.save();
    ctx.fillStyle = shade(dotColor, glow);
    ctx.globalAlpha = alpha;
    const rows = [-0.32, -0.08, 0.18, 0.38];
    for (let i = 2; i < points.length - 2; i += 1) {
      for (let r = 0; r < rows.length; r += 1) {
        if (detailNoise(f.kind, i, r + 21) > amount * 0.58 + 0.18) continue;
        const p = surfacePointAt(points, i, rows[r] + (detailNoise(f.kind, i, r + 33) - 0.5) * 0.1);
        const radius = Math.max(0.42, body * (0.025 + detailNoise(f.kind, i, r + 44) * 0.026));
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius * 1.25, radius * 0.82, detailNoise(f.kind, i, r + 55) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  if (pattern === "veil" || pattern === "maze" || pattern === "gouramiBars" || pattern === "ram") {
    ctx.save();
    ctx.globalAlpha = lightOn ? 0.34 : 0.18;
    ctx.strokeStyle = shade(f.spec.accent, glow);
    ctx.lineWidth = Math.max(0.45, scale * 0.42);
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath();
      for (let i = 2; i < points.length - 2; i += 1) {
        const p = surfacePointAt(points, i, -0.32 + k * 0.26 + Math.sin(i * 0.8 + k) * 0.03);
        if (i === 2) ctx.moveTo(p.x, p.y);
        else ctx.quadraticCurveTo(p.x + body * 0.04, p.y + Math.sin(i + k) * body * 0.02, p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  if (pattern === "goldfish" || pattern === "koi" || pattern === "tailSpots") {
    ctx.save();
    ctx.globalAlpha = lightOn ? 0.22 : 0.1;
    ctx.strokeStyle = shade("#fff6d8", glow);
    ctx.lineWidth = Math.max(0.5, scale * 0.45);
    for (let i = 2; i < points.length - 3; i += 2) {
      const p = surfacePointAt(points, i, -0.35 + detailNoise(f.kind, i, 66) * 0.7);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.9, body * 0.07), Math.PI * 0.15, Math.PI * 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function spawnFry(a, b) {
  const babies = 1;
  for (let i = 0; i < babies; i += 1) {
    const fry = new Fish(a.kind, (a.x + b.x) / 2 + rand(-8, 8), (a.y + b.y) / 2 + rand(-5, 5), 0.28, makePersonality(a, b));
    fry.hunger = 18;
    fry.vx = rand(-0.22, 0.22);
    fry.vy = rand(-0.16, 0.16);
    fish.push(fry);
  }
  breedPulse = 1;
  makeRipple((a.x + b.x) / 2, (a.y + b.y) / 2, "breed");
  queueStateSave(500);
}

function makeRipple(x, y, type) {
  ripples.push({ x, y, life: 1, type });
}

function serializeFish(f) {
  const values = {};
  for (const [key, value] of Object.entries(f)) {
    if (key === "spec" || key === "target" || key === "kind" || key === "born" || key === "neighbors" || key === "spine" || key === "force") continue;
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean" || value === null) {
      values[key] = value;
    } else if (value && typeof value === "object") {
      values[key] = JSON.parse(JSON.stringify(value));
    }
  }
  return {
    species: f.spec.name,
    bornAgeMs: Math.max(0, performance.now() - f.born),
    values
  };
}

function serializeAquariumState() {
  return {
    schemaVersion: 1,
    savedAt: Date.now(),
    waterQuality,
    lightOn,
    flowerBloomClock,
    fish: fish.map(serializeFish),
    foods: foods.map((food) => ({ ...food })),
    flowers: grassFlowers.map((flower) => ({
      ...flower,
      type: flower.type.name
    }))
  };
}

function restoreFish(saved) {
  const kind = species.findIndex((entry) => entry.name === saved.species);
  if (kind < 0 || !saved.values || typeof saved.values !== "object") return null;
  const values = saved.values;
  const restored = new Fish(
    kind,
    clamp(Number(values.x) || W / 2, 15, W - 15),
    clamp(Number(values.y) || H / 2, 28, bottom - 4),
    clamp(Number(values.age) || 1, 0.28, 1),
    values.personality && typeof values.personality === "object" ? values.personality : makePersonality()
  );
  Object.assign(restored, values);
  restored.kind = kind;
  restored.spec = species[kind];
  restored.target = null;
  restored.born = performance.now() - clamp(Number(saved.bornAgeMs) || 0, 0, 1000 * 60 * 60 * 24 * 365);
  restored.x = clamp(Number(restored.x) || W / 2, 15, W - 15);
  restored.y = clamp(Number(restored.y) || H / 2, 28, bottom - 4);
  return restored;
}

function restoreAquariumState(state) {
  if (!state || state.schemaVersion !== 1 || !Array.isArray(state.fish) || state.fish.length === 0) return false;
  const restoredFish = state.fish.map(restoreFish).filter(Boolean);
  if (restoredFish.length === 0) return false;

  fish = restoredFish;
  const savedWaterQuality = Number(state.waterQuality);
  waterQuality = Number.isFinite(savedWaterQuality) ? clamp(savedWaterQuality, 0, 100) : 92;
  lightOn = state.lightOn !== false;
  const savedBloomClock = Number(state.flowerBloomClock);
  flowerBloomClock = Number.isFinite(savedBloomClock)
    ? clamp(savedBloomClock, 0, FLOWER_BLOOM_INTERVAL[1])
    : rand(...FLOWER_BLOOM_INTERVAL);
  foods = Array.isArray(state.foods)
    ? state.foods
        .filter((food) => food && Number.isFinite(food.x) && Number.isFinite(food.y))
        .map((food) => ({
          x: clamp(food.x, 8, W - 8),
          y: clamp(food.y, 20, bottom),
          vy: clamp(Number(food.vy) || 0.1, 0.01, 0.8),
          eaten: false,
          life: clamp(Number(food.life) || 0, 0, 1)
        }))
        .filter((food) => food.life > 0)
    : [];
  grassFlowers = Array.isArray(state.flowers)
    ? state.flowers
        .map((flower) => {
          const type = flowerTypes.find((entry) => entry.name === flower.type);
          if (!type) return null;
          return {
            x: clamp(Number(flower.x) || W / 2, 12, W - 12),
            y: clamp(Number(flower.y) || bottom - 22, 20, bottom),
            stem: clamp(Number(flower.stem) || 12, 6, 24),
            size: clamp(Number(flower.size) || 3, 1.5, 6),
            phase: Number(flower.phase) || 0,
            age: clamp(Number(flower.age) || 0, 0, Number(flower.life) || FLOWER_LIFE_RANGE[1]),
            life: clamp(Number(flower.life) || FLOWER_LIFE_RANGE[0], FLOWER_LIFE_RANGE[0], FLOWER_LIFE_RANGE[1]),
            type
          };
        })
        .filter(Boolean)
    : [];
  grassLayer = null;
  updateBadges();
  return true;
}

async function loadSavedAquarium() {
  try {
    if (window.cyberfishApp?.loadState) {
      return restoreAquariumState(await window.cyberfishApp.loadState());
    }
    const content = localStorage.getItem("cyberfish-aquarium-state");
    return content ? restoreAquariumState(JSON.parse(content)) : false;
  } catch (error) {
    console.warn("Unable to restore aquarium state:", error);
    return false;
  }
}

async function saveAquariumState() {
  if (stateSaveInFlight || fish.length === 0) return false;
  stateSaveInFlight = true;
  try {
    const state = serializeAquariumState();
    const saved = window.cyberfishApp?.saveState
      ? await window.cyberfishApp.saveState(state)
      : (localStorage.setItem("cyberfish-aquarium-state", JSON.stringify(state)), true);
    if (saved) lastStateSave = performance.now();
    return saved;
  } catch (error) {
    console.warn("Unable to save aquarium state:", error);
    return false;
  } finally {
    stateSaveInFlight = false;
  }
}

function queueStateSave(delay = 250) {
  clearTimeout(queuedSaveTimer);
  queuedSaveTimer = setTimeout(() => {
    saveAquariumState();
  }, delay);
}

function createFish(kind, x = rand(45, W - 45), age = 1) {
  const zone = species[kind].zone || [42, bottom - 12];
  return new Fish(kind, x, rand(zone[0], zone[1]), age);
}

function pickFishSet() {
  const picked = [];
  const poolFor = (filter) =>
    species
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => filter(entry) && !picked.includes(index));
  const addFrom = (filter) => {
    const pool = poolFor(filter).sort(() => Math.random() - 0.5);
    if (pool.length > 0) picked.push(pool[0].index);
  };
  const addWeighted = (groups) => {
    const roll = Math.random();
    let cursor = 0;
    for (const group of groups) {
      cursor += group.weight;
      if (roll <= cursor) {
        addFrom(group.filter);
        return;
      }
    }
    addFrom(() => true);
  };

  addWeighted([
    { weight: 0.44, filter: (entry) => entry.realMotion === "school" },
    { weight: 0.24, filter: (entry) => entry.realMotion === "glide" || entry.realMotion === "tail-flick" || entry.realMotion === "burst" },
    { weight: 0.14, filter: (entry) => entry.realMotion === "hover" || entry.realMotion === "sail" || entry.realMotion === "disk" },
    { weight: 0.1, filter: (entry) => entry.realMotion === "jelly" },
    { weight: 0.08, filter: (entry) => entry.realMotion === "bottom" || entry.realMotion === "sucker" || entry.realMotion === "loach" || entry.realMotion === "graze" }
  ]);

  addWeighted([
    { weight: 0.34, filter: (entry) => entry.realMotion === "glide" || entry.realMotion === "tail-flick" || entry.realMotion === "burst" },
    { weight: 0.24, filter: (entry) => entry.realMotion === "school" },
    { weight: 0.18, filter: (entry) => entry.realMotion === "bottom" || entry.realMotion === "sucker" || entry.realMotion === "loach" || entry.realMotion === "graze" },
    { weight: 0.14, filter: (entry) => entry.realMotion === "hover" || entry.realMotion === "sail" || entry.realMotion === "disk" },
    { weight: 0.1, filter: (entry) => entry.realMotion === "jelly" }
  ]);

  while (picked.length < targetSpeciesCount) {
    const pool = species
      .map((entry, index) => ({ entry, index }))
      .filter(({ index }) => !picked.includes(index))
      .sort(() => Math.random() - 0.5);
    if (pool.length > 0) picked.push(pool[0].index);
  }

  return picked.slice(0, targetSpeciesCount).flatMap((kind) => [kind, kind]);
}

function seedTank() {
  const params = new URLSearchParams(window.location.search);
  const previewJelly = params.get("jellyPreview") === "1";
  const firstJelly = species.findIndex((entry) => entry.bodyPlan === "jelly");
  const kinds = previewJelly && firstJelly >= 0 ? [firstJelly, firstJelly + 2, firstJelly + 7, firstJelly + 8] : [0, 0, 1, 1];
  fish = kinds.map((kind, index) => createFish(kind, 70 + index * 70, 1));
  if (params.get("feedPreview") === "1") {
    foods.push({ x: 182, y: 58, vy: 0.24, eaten: false, life: 1 });
    for (const f of fish) {
      f.hunger = 82;
      f.x = 122 + Math.random() * 92;
      f.y = 72 + Math.random() * 42;
    }
  }
  grassFlowers = [];
  const starterFlowers = Math.random() < 0.45 ? [rand(260, W - 36)] : [rand(62, 96), rand(254, W - 34)];
  for (const x of starterFlowers) {
    spawnGrassFlower(x);
    grassFlowers[grassFlowers.length - 1].age = rand(0.6, 3.2);
  }
  flowerBloomClock = rand(...FLOWER_BLOOM_INTERVAL);

  for (let i = 0; i < 16; i += 1) {
    bubbles.push({ x: rand(20, W - 20), y: rand(35, bottom), r: rand(1, 2.2), speed: rand(0.18, 0.5) });
  }
}

function swapFish() {
  foods = [];
  ripples = [];
  const kinds = pickFishSet();
  fish = kinds.map((kind, index) => createFish(kind, 48 + index * ((W - 96) / Math.max(1, kinds.length - 1)), 1));
  waterQuality = clamp(waterQuality + 8, 0, 100);
  makeRipple(W / 2, H / 2, "water");
  queueStateSave();
}

function feed() {
  for (let i = 0; i < 12; i += 1) {
    foods.push({ x: rand(68, W - 66), y: rand(28, 48), vy: rand(0.24, 0.46), eaten: false, life: 1 });
  }
  waterQuality = clamp(waterQuality - 1.5, 0, 100);
  queueStateSave();
}

function changeWater() {
  waterQuality = 100;
  foods = [];
  for (const f of fish) {
    f.energy = clamp(f.energy + 0.08, 0.6, 1.25);
    f.stress = clamp(f.stress + 0.1, 0, 1);
    f.stamina = clamp(f.stamina + 0.08, 0.22, 1);
    f.vx += rand(-0.24, 0.24);
    f.vy += rand(-0.1, 0.1);
  }
  makeRipple(W / 2, H / 2, "water");
  queueStateSave();
}

function toggleLight() {
  lightOn = !lightOn;
  grassLayer = null;
  for (const f of fish) {
    f.vx += rand(-0.16, 0.16);
    f.vy += rand(-0.08, 0.08);
    f.stress = clamp(f.stress + (lightOn ? 0.08 : 0.14) * (0.6 + f.personality.caution), 0, 1);
  }
  queueStateSave();
}

function update(dt) {
  rebuildFishNeighbors();
  waterQuality = clamp(waterQuality - dt * (0.07 + foods.length * 0.006 + fish.length * 0.003), 0, 100);
  breedPulse = Math.max(0, breedPulse - dt * 0.9);
  updateGrassFlowers(dt);

  for (const food of foods) {
    const flow = waterFlowAt(food.x, food.y);
    food.x += flow.x * dt * 42;
    food.y += (food.vy + flow.y * 0.35) * dt * 60;
    food.x = clamp(food.x, 8, W - 8);
    food.life -= dt * 0.035;
    if (food.y > bottom - 2) food.vy = 0.03;
  }
  compactActive(foods, isActiveFood);

  for (const bubble of bubbles) {
    const flow = waterFlowAt(bubble.x, bubble.y);
    bubble.y -= bubble.speed * dt * 60;
    bubble.x += Math.sin((bubble.y + bubble.r) * 0.06) * 0.12 + flow.x * dt * 80;
    if (bubble.y < 26) {
      bubble.y = rand(bottom - 4, bottom + 30);
      bubble.x = rand(20, W - 20);
    }
  }

  for (const ripple of ripples) {
    ripple.life -= dt * 1.7;
  }
  compactActive(ripples, isActiveRipple);

  for (const f of fish) f.update(dt);
}

function rebuildFishNeighbors() {
  for (const f of fish) f.neighbors.length = 0;
  const maxDistanceSquared = 110 * 110;
  for (let i = 0; i < fish.length - 1; i += 1) {
    const a = fish[i];
    for (let j = i + 1; j < fish.length; j += 1) {
      const b = fish[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > maxDistanceSquared) continue;
      a.neighbors.push(b);
      b.neighbors.push(a);
    }
  }
}

function compactActive(items, keep) {
  let write = 0;
  for (let read = 0; read < items.length; read += 1) {
    const item = items[read];
    if (keep(item)) items[write++] = item;
  }
  items.length = write;
}

function isActiveFood(food) {
  return !food.eaten && food.life > 0;
}

function isActiveRipple(ripple) {
  return ripple.life > 0;
}

function isActiveFlower(flower) {
  return flower.age < flower.life;
}

function draw(time) {
  drawTankBackground(time);
  drawPlant(time);
  drawRock(time);
  drawFood(time);
  drawBubbles(time);

  drawOrder.length = fish.length;
  for (let i = 0; i < fish.length; i += 1) drawOrder[i] = fish[i];
  drawOrder.sort((a, b) => a.y - b.y);
  for (const f of drawOrder) f.draw(time);

  drawRipples();
  drawGlass();
  updateBadges();
}

function drawTankBackground(time) {
  const murk = Math.pow(clamp((80 - waterQuality) / 80, 0, 1), 1.8);
  if (!tankBackgroundLayer || tankBackgroundLight !== lightOn) {
    tankBackgroundLayer = document.createElement("canvas");
    tankBackgroundLayer.width = W;
    tankBackgroundLayer.height = H;
    tankBackgroundLight = lightOn;
    drawStaticTankBackground(tankBackgroundLayer.getContext("2d"));
  }
  ctx.drawImage(tankBackgroundLayer, 0, 0);

  ctx.strokeStyle = lightOn ? "rgba(223, 255, 245, 0.11)" : "rgba(160, 190, 220, 0.06)";
  ctx.lineWidth = 1;
  for (let y = 24; y < bottom - 5; y += 24) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const wave = Math.sin(x * 0.035 + time * 0.0015 + y) * 1.7;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  ctx.fillStyle = lightOn ? "rgba(238, 255, 232, 0.42)" : "rgba(132, 184, 194, 0.18)";
  for (let i = 0; i < 20; i += 1) {
    const x = (i * 73 + Math.sin(time * 0.0005 + i) * 18) % W;
    const y = 28 + ((i * 37) % 128);
    ctx.globalAlpha = 0.08 + (i % 4) * 0.035;
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + (i % 3) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (murk > 0.01) {
    ctx.fillStyle = `rgba(93, 91, 71, ${murk * 0.28})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawStaticTankBackground(target) {
  const water = target.createLinearGradient(0, 0, 0, H);
  water.addColorStop(0, lightOn ? "#2bb1c4" : "#10283a");
  water.addColorStop(0.42, lightOn ? "#137f94" : "#0b2634");
  water.addColorStop(1, lightOn ? "#123e45" : "#0b1d25");
  target.fillStyle = water;
  target.fillRect(0, 0, W, H);

  const depthGlow = target.createRadialGradient(W * 0.48, H * 0.38, 12, W * 0.48, H * 0.42, W * 0.82);
  depthGlow.addColorStop(0, lightOn ? "rgba(127, 255, 225, 0.12)" : "rgba(74, 136, 158, 0.06)");
  depthGlow.addColorStop(0.58, "rgba(20, 84, 93, 0.02)");
  depthGlow.addColorStop(1, "rgba(3, 12, 16, 0.3)");
  target.fillStyle = depthGlow;
  target.fillRect(0, 0, W, H);

  if (lightOn) {
    const surface = target.createLinearGradient(0, 0, 0, 28);
    surface.addColorStop(0, "rgba(241, 255, 241, 0.22)");
    surface.addColorStop(1, "rgba(241, 255, 241, 0)");
    target.fillStyle = surface;
    target.fillRect(0, 0, W, 30);

    const beam = target.createLinearGradient(56, 0, 236, H);
    beam.addColorStop(0, "rgba(255, 242, 184, 0.26)");
    beam.addColorStop(0.42, "rgba(162, 248, 226, 0.08)");
    beam.addColorStop(1, "rgba(255, 255, 255, 0)");
    target.fillStyle = beam;
    target.beginPath();
    target.moveTo(72, 0);
    target.lineTo(174, 0);
    target.lineTo(238, H);
    target.lineTo(18, H);
    target.closePath();
    target.fill();

    const narrowBeam = target.createLinearGradient(236, 0, 298, H);
    narrowBeam.addColorStop(0, "rgba(245, 255, 222, 0.14)");
    narrowBeam.addColorStop(1, "rgba(245, 255, 222, 0)");
    target.fillStyle = narrowBeam;
    target.beginPath();
    target.moveTo(222, 0);
    target.lineTo(260, 0);
    target.lineTo(286, H);
    target.lineTo(214, H);
    target.closePath();
    target.fill();
  }

  target.fillStyle = lightOn ? "rgba(10, 53, 54, 0.16)" : "rgba(3, 18, 25, 0.2)";
  for (let i = 0; i < 7; i += 1) {
    const x = 210 + i * 18;
    const h = 38 + (i % 3) * 13;
    target.beginPath();
    target.ellipse(x, bottom - h * 0.55, 12 + i, h, -0.08, 0, Math.PI * 2);
    target.fill();
  }

  const sand = target.createLinearGradient(0, bottom - 10, 0, H);
  sand.addColorStop(0, lightOn ? "#8c8064" : "#4b4a42");
  sand.addColorStop(1, lightOn ? "#4b4f43" : "#282d2b");
  target.fillStyle = sand;
  target.beginPath();
  target.moveTo(0, bottom - 1);
  target.bezierCurveTo(74, bottom - 14, 132, bottom - 3, 190, bottom - 10);
  target.bezierCurveTo(256, bottom - 18, 300, bottom - 8, W, bottom - 15);
  target.lineTo(W, H);
  target.lineTo(0, H);
  target.closePath();
  target.fill();

  for (let i = 0; i < 62; i += 1) {
    const x = (i * 47 + 11) % W;
    const wave = Math.sin(i * 1.7) * 5;
    const y = bottom - 5 + ((i * 19) % 18) * 0.68 + wave * 0.16;
    target.fillStyle = i % 4 === 0 ? "#a89a79" : i % 4 === 1 ? "#5c655a" : "#3f4b48";
    target.globalAlpha = 0.18 + (i % 5) * 0.055;
    target.beginPath();
    target.ellipse(x, y, 0.9 + (i % 3) * 0.7, 0.5 + (i % 2) * 0.45, 0, 0, Math.PI * 2);
    target.fill();
  }
  target.globalAlpha = 1;
}

function drawPlant(time) {
  ctx.lineCap = "round";
  drawGrassLayer();
  drawSwayingGrass(time);
  drawGrassFlowers(time);
}

function updateGrassFlowers(dt) {
  for (const flower of grassFlowers) {
    flower.age += dt;
  }
  compactActive(grassFlowers, isActiveFlower);
  flowerBloomClock -= dt;
  if (!lightOn || waterQuality < 62 || grassFlowers.length >= FLOWER_MAX_COUNT) {
    flowerBloomClock = Math.max(flowerBloomClock, 30);
    return;
  }
  if (flowerBloomClock > 0) return;
  spawnGrassFlower();
  flowerBloomClock = rand(...FLOWER_BLOOM_INTERVAL);
}

function spawnGrassFlower(x = rand(26, W - 18)) {
  const bedY = riverbedY(x);
  const type = flowerTypes[Math.floor(Math.random() * flowerTypes.length)];
  grassFlowers.push({
    x,
    y: bedY - rand(15, 22),
    stem: rand(10, 16),
    size: rand(2.8, 4) * type.size,
    phase: rand(0, Math.PI * 2),
    age: 0,
    life: rand(...FLOWER_LIFE_RANGE),
    type
  });
}

function drawGrassFlowers(time) {
  for (const flower of grassFlowers) {
    const type = flower.type;
    const appear = clamp(flower.age / 4.5, 0, 1);
    const fade = clamp((flower.life - flower.age) / 24, 0, 1);
    const alpha = appear * fade * type.alpha;
    if (alpha <= 0) continue;

    const sway = Math.sin(time * 0.0018 + flower.phase) * (0.85 + flower.size * 0.12);
    const headX = flower.x + sway;
    const headY = flower.y - Math.sin(appear * Math.PI) * 1.2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.strokeStyle = lightOn ? "rgba(126, 210, 92, 0.58)" : "rgba(63, 122, 77, 0.42)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(flower.x, flower.y + flower.stem);
    ctx.quadraticCurveTo(flower.x + sway * 0.35, flower.y + flower.stem * 0.4, headX, headY);
    ctx.stroke();

    ctx.fillStyle = type.petal;
    if (type.shape === "bell") {
      drawBellFlower(headX, headY, flower, type);
    } else if (type.shape === "sprig") {
      drawSprigFlower(headX, headY, flower, type);
    } else {
      drawRadialFlower(headX, headY, flower, type);
    }
    ctx.fillStyle = type.core;
    ctx.beginPath();
    ctx.arc(headX, headY, flower.size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawRadialFlower(headX, headY, flower, type) {
  for (let i = 0; i < type.petals; i += 1) {
    const a = flower.phase + i * (Math.PI * 2 / type.petals);
    ctx.beginPath();
    ctx.ellipse(
      headX + Math.cos(a) * flower.size * type.spreadX,
      headY + Math.sin(a) * flower.size * type.spreadY,
      flower.size * type.rx,
      flower.size * type.ry,
      a,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (type.shape === "point") {
      ctx.beginPath();
      ctx.moveTo(headX + Math.cos(a) * flower.size * 1.25, headY + Math.sin(a) * flower.size * 0.72);
      ctx.lineTo(headX + Math.cos(a + 0.5) * flower.size * 0.42, headY + Math.sin(a + 0.5) * flower.size * 0.28);
      ctx.lineTo(headX + Math.cos(a - 0.5) * flower.size * 0.42, headY + Math.sin(a - 0.5) * flower.size * 0.28);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawBellFlower(headX, headY, flower, type) {
  for (let i = 0; i < type.petals; i += 1) {
    const offset = (i - (type.petals - 1) / 2) * flower.size * 0.55;
    ctx.beginPath();
    ctx.ellipse(
      headX + offset,
      headY + flower.size * 0.18,
      flower.size * type.rx,
      flower.size * type.ry,
      offset * 0.06,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

function drawSprigFlower(headX, headY, flower, type) {
  for (let i = 0; i < 4; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = headY - flower.size * 0.6 + i * flower.size * 0.38;
    const x = headX + side * flower.size * (0.35 + i * 0.08);
    ctx.beginPath();
    ctx.ellipse(x, y, flower.size * type.rx, flower.size * type.ry, side * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrassLayer() {
  if (!grassLayer || grassLayerLight !== lightOn) {
    grassLayer = document.createElement("canvas");
    grassLayer.width = W;
    grassLayer.height = H;
    grassLayerLight = lightOn;
    const g = grassLayer.getContext("2d");
    g.lineCap = "round";
    drawGrassMatOn(g);

    for (let row = 0; row < 12; row += 1) {
      const rowAlpha = 0.62 - row * 0.028;
      const count = 230 - row * 8;
      for (let i = 0; i < count; i += 1) {
        const x = -4 + i * (W + 8) / count + Math.sin(i * 1.7 + row) * 0.85;
        const bedY = riverbedY(x);
        const baseY = bedY + row * 2.25 + Math.sin(i * 0.9) * 0.55;
        if (baseY > H + 2) continue;

        const h = 4.8 + (i % 5) * 1.35 + Math.max(0, 7 - row) * 0.42;
        const lean = Math.sin(i * 0.31 + row * 0.55) * (0.42 + row * 0.025);
        const hue = i % 4 === 0 ? "#78d76c" : i % 4 === 1 ? "#5cc768" : i % 4 === 2 ? "#91da69" : "#45b966";
        g.strokeStyle = lightOn ? hue : "#2d6547";
        g.globalAlpha = rowAlpha;
        g.lineWidth = i % 6 === 0 ? 1.18 : 0.86;
        g.beginPath();
        g.moveTo(x, baseY);
        g.bezierCurveTo(x - 0.55, baseY - h * 0.35, x + lean * 0.4, baseY - h * 0.72, x + lean, baseY - h);
        g.stroke();

        if ((i + row) % 3 === 0) {
          const side = i % 2 === 0 ? -1 : 1;
          g.fillStyle = lightOn ? "rgba(130, 220, 101, 0.45)" : "rgba(65, 118, 80, 0.36)";
          g.beginPath();
          g.ellipse(x + side * 1.05 + lean * 0.28, baseY - h * 0.5, 1.45, 0.55, side * 0.35, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    g.fillStyle = lightOn ? "rgba(58, 140, 62, 0.55)" : "rgba(38, 86, 62, 0.5)";
    g.globalAlpha = 1;
    for (let row = 0; row < 8; row += 1) {
      for (let i = 0; i < 170; i += 1) {
        const x = -5 + i * 2.2 + Math.sin(i + row) * 0.9;
        const y = riverbedY(x) + row * 3.4 + Math.cos(i * 1.8 + row) * 0.9;
        g.beginPath();
        g.ellipse(x, y, 2.35, 0.82, Math.sin(i) * 0.55, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
  ctx.drawImage(grassLayer, 0, 0);
}

function drawSwayingGrass(time) {
  ctx.lineCap = "round";
  if (!swayingGrassGeometry) swayingGrassGeometry = createSwayingGrassGeometry();

  for (const group of swayingGrassGeometry.strokeGroups) {
    ctx.strokeStyle = lightOn ? group.hue : "#2d6547";
    ctx.globalAlpha = group.alpha;
    ctx.lineWidth = group.lineWidth;
    ctx.beginPath();
    for (const blade of group.blades) {
      blade.sway = Math.sin(time * 0.0017 + blade.phase) * blade.swayAmount;
      ctx.moveTo(blade.x, blade.baseY);
      ctx.bezierCurveTo(
        blade.x - 0.55,
        blade.baseY - blade.h * 0.35,
        blade.x + blade.sway * 0.4,
        blade.baseY - blade.h * 0.72,
        blade.x + blade.sway,
        blade.baseY - blade.h
      );
    }
    ctx.stroke();
  }

  ctx.fillStyle = lightOn ? "rgba(130, 220, 101, 0.28)" : "rgba(65, 118, 80, 0.24)";
  for (const group of swayingGrassGeometry.leafGroups) {
    ctx.globalAlpha = group.alpha;
    ctx.beginPath();
    for (const blade of group.blades) {
      ctx.moveTo(blade.x + blade.leafSide * 1.05 + blade.sway * 0.28 + 1.45, blade.baseY - blade.h * 0.5);
      ctx.ellipse(blade.x + blade.leafSide * 1.05 + blade.sway * 0.28, blade.baseY - blade.h * 0.5, 1.45, 0.55, blade.leafSide * 0.35, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function createSwayingGrassGeometry() {
  const strokeGroups = new Map();
  const leafGroups = new Map();
  const hues = ["#78d76c", "#5cc768", "#91da69", "#45b966"];
  for (let row = 0; row < 5; row += 1) {
    const count = 58 - row * 4;
    for (let i = 0; i < count; i += 1) {
      const x = -4 + i * (W + 8) / count + Math.sin(i * 1.7 + row) * 0.85;
      const baseY = riverbedY(x) + row * 2.25 + Math.sin(i * 0.9) * 0.55;
      if (baseY > H + 2) continue;
      const blade = {
        x,
        baseY,
        h: 5.8 + (i % 5) * 1.2 + Math.max(0, 5 - row) * 0.38,
        phase: i * 0.63 + row * 0.55,
        swayAmount: 0.75 + row * 0.04,
        hue: hues[i % hues.length],
        alpha: 0.32 - row * 0.035,
        lineWidth: i % 6 === 0 ? 1.22 : 0.88,
        leafSide: (i + row) % 7 === 0 ? (i % 2 === 0 ? -1 : 1) : 0,
        sway: 0
      };
      const strokeKey = `${row}:${i % hues.length}:${blade.lineWidth}`;
      if (!strokeGroups.has(strokeKey)) {
        strokeGroups.set(strokeKey, { hue: blade.hue, alpha: blade.alpha, lineWidth: blade.lineWidth, blades: [] });
      }
      strokeGroups.get(strokeKey).blades.push(blade);
      if (blade.leafSide !== 0) {
        if (!leafGroups.has(row)) leafGroups.set(row, { alpha: blade.alpha, blades: [] });
        leafGroups.get(row).blades.push(blade);
      }
    }
  }
  return {
    strokeGroups: Array.from(strokeGroups.values()),
    leafGroups: Array.from(leafGroups.values())
  };
}

function drawGrassMatOn(target) {
  const mat = target.createLinearGradient(0, bottom - 15, 0, H);
  mat.addColorStop(0, lightOn ? "rgba(68, 151, 66, 0.62)" : "rgba(31, 77, 55, 0.58)");
  mat.addColorStop(1, lightOn ? "rgba(42, 112, 54, 0.78)" : "rgba(25, 65, 48, 0.72)");
  target.fillStyle = mat;
  target.beginPath();
  target.moveTo(0, riverbedY(0) - 1);
  for (let x = 0; x <= W; x += 12) {
    target.lineTo(x, riverbedY(x) - 1);
  }
  target.lineTo(W, H);
  target.lineTo(0, H);
  target.closePath();
  target.fill();
}

function riverbedY(x) {
  const t = clamp(x / W, 0, 1);
  return bottom - 1 - 13.5 * t + Math.sin(t * Math.PI * 3.2) * 2.2;
}

function drawRock() {
  if (!rockLayer || rockLayerLight !== lightOn) {
    rockLayer = document.createElement("canvas");
    rockLayer.width = W;
    rockLayer.height = H;
    rockLayerLight = lightOn;
    drawRockOn(rockLayer.getContext("2d"));
  }
  ctx.drawImage(rockLayer, 0, 0);
}

function drawRockOn(target) {
  target.save();
  target.translate(86, bottom - 5);
  const rock = target.createLinearGradient(-28, -25, 34, 12);
  rock.addColorStop(0, lightOn ? "#8f9f95" : "#53605f");
  rock.addColorStop(0.48, lightOn ? "#57665f" : "#384445");
  rock.addColorStop(1, lightOn ? "#273235" : "#202a2d");
  target.fillStyle = lightOn ? rock : "#303940";
  target.beginPath();
  target.moveTo(-42, 11);
  target.quadraticCurveTo(-33, -33, -4, -29);
  target.quadraticCurveTo(22, -46, 44, 9);
  target.closePath();
  target.fill();
  target.strokeStyle = lightOn ? "rgba(220, 236, 219, 0.16)" : "rgba(180, 207, 206, 0.08)";
  target.lineWidth = 1;
  target.beginPath();
  target.moveTo(-13, -26);
  target.lineTo(-23, 8);
  target.moveTo(9, -29);
  target.lineTo(22, 6);
  target.stroke();

  target.fillStyle = "rgba(11, 18, 19, 0.36)";
  target.beginPath();
  target.ellipse(7, 2, 15, 7, -0.1, 0, Math.PI * 2);
  target.fill();

  target.translate(-28, 8);
  target.fillStyle = lightOn ? "#4d5d56" : "#293638";
  target.beginPath();
  target.moveTo(-16, 5);
  target.quadraticCurveTo(-7, -16, 8, -11);
  target.quadraticCurveTo(20, -9, 22, 6);
  target.closePath();
  target.fill();

  target.translate(80, 2);
  target.fillStyle = lightOn ? "#61736b" : "#334143";
  target.beginPath();
  target.moveTo(-18, 5);
  target.quadraticCurveTo(-8, -15, 10, -10);
  target.quadraticCurveTo(24, -6, 25, 6);
  target.closePath();
  target.fill();
  target.restore();
}

function drawFood(time) {
  for (const food of foods) {
    let claimers = 0;
    for (const f of fish) {
      if (Math.hypot(f.x - food.x, f.y - food.y) < 42 && f.hunger > 34) claimers += 1;
    }
    if (claimers > 1) {
      ctx.globalAlpha = clamp(food.life, 0, 1) * 0.18;
      ctx.strokeStyle = "#ffe58a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(food.x, food.y, 6 + claimers * 1.7 + Math.sin(time * 0.01 + food.x) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = clamp(food.life, 0, 1);
    ctx.fillStyle = claimers > 1 ? "#ffe07a" : "#ffcf56";
    ctx.beginPath();
    ctx.arc(food.x, food.y, claimers > 1 ? 2.65 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBubbles(time) {
  ctx.strokeStyle = lightOn ? "rgba(212, 250, 255, 0.42)" : "rgba(160, 203, 220, 0.24)";
  ctx.lineWidth = 1;
  for (const bubble of bubbles) {
    ctx.globalAlpha = 0.5 + Math.sin(time * 0.003 + bubble.x) * 0.16;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawRipples() {
  for (const ripple of ripples) {
    const radius = (1 - ripple.life) * (ripple.type === "breed" ? 36 : 22);
    ctx.strokeStyle = ripple.type === "breed" ? `rgba(255, 233, 112, ${ripple.life * 0.7})` : `rgba(228, 255, 255, ${ripple.life * 0.55})`;
    ctx.lineWidth = ripple.type === "breed" ? 2 : 1;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGlass() {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath();
  ctx.moveTo(13, 9);
  ctx.lineTo(70, 9);
  ctx.lineTo(28, bottom - 12);
  ctx.lineTo(5, bottom - 12);
  ctx.closePath();
  ctx.fill();

  if (breedPulse > 0) {
    ctx.fillStyle = `rgba(255, 231, 113, ${breedPulse * 0.13})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function updateBadges() {
  const waterText = `水质 ${Math.round(waterQuality)}`;
  const lightText = lightOn ? "灯光开" : "灯光关";
  const fishText = `鱼 ${fish.length}`;
  if (waterBadge.textContent !== waterText) waterBadge.textContent = waterText;
  if (lightBadge.textContent !== lightText) lightBadge.textContent = lightText;
  if (fishBadge.textContent !== fishText) fishBadge.textContent = fishText;
  if (document.body.classList.contains("is-docked")) {
    if (windowTitle.textContent !== fishText) windowTitle.textContent = fishText;
  }
}

function setDockVisualState(isDocked) {
  document.body.classList.toggle("is-docked", isDocked);
  dockBtn.textContent = isDocked ? "恢复" : "贴边";
  closeBtn.textContent = isDocked ? "×" : "关闭";
  windowTitle.textContent = isDocked ? `鱼 ${fish.length}` : "赛博鱼";
}

function tick(now) {
  const dt = Math.min(0.034, (now - lastTime) / 1000);
  lastTime = now;
  simulationTime = now;
  if (now - lastStateSave >= 10000) {
    saveAquariumState();
  }
  if (document.body.classList.contains("is-docked")) {
    if (now - lastDockedUpdate > 250) {
      update(Math.min(0.25, (now - lastDockedUpdate) / 1000));
      updateBadges();
      lastDockedUpdate = now;
    }
    setTimeout(() => requestAnimationFrame(tick), 250);
    return;
  }
  lastDockedUpdate = now;
  update(dt);
  draw(now);
  requestAnimationFrame(tick);
}

function setupDesktopDocking() {
  if (!desktopMode) return;
  document.body.classList.add("desktop-app");
  if (new URLSearchParams(window.location.search).get("dockPreview") === "1") {
    setDockVisualState(true);
  }
  if (!window.cyberfishApp) return;
  window.cyberfishApp.getDockState().then((isDocked) => {
    setDockVisualState(isDocked);
  });
  window.cyberfishApp.onDockState((isDocked) => {
    setDockVisualState(isDocked);
  });

  dockBtn.addEventListener("click", async () => {
    const isDocked = await window.cyberfishApp.toggleDock();
    setDockVisualState(isDocked);
  });

  closeBtn.addEventListener("click", async () => {
    await window.cyberfishApp.close(serializeAquariumState());
  });
}

feedBtn.addEventListener("click", feed);
waterBtn.addEventListener("click", changeWater);
swapBtn.addEventListener("click", swapFish);
lightBtn.addEventListener("click", toggleLight);

setupDesktopDocking();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveAquariumState();
});

async function initializeGame() {
  const restored = await loadSavedAquarium();
  if (!restored) {
    seedTank();
    queueStateSave(500);
  }
  updateBadges();
  lastTime = performance.now();
  lastDockedUpdate = lastTime;
  lastStateSave = lastTime;
  requestAnimationFrame(tick);
}

initializeGame();
