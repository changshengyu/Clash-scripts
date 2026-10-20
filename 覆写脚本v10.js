// =========================================================
// mihomo 覆写脚本 v10
// 结构参考 Loon 自动配置（iKeLee）：
//   节点 → 地区组（自动 url-test + 手动 select）→ 兜底 fallback
//   → 每类服务一个独立 select 分流组（可在面板里单独切换）
// https://raw.githubusercontent.com/changshengyu/Clash-scripts/refs/heads/main/%E8%A6%86%E5%86%99%E8%84%9A%E6%9C%ACv10.js
// =========================================================

function main(config) {

  config.proxies = config.proxies || [];
  config["proxy-groups"] = config["proxy-groups"] || [];
  config["rule-providers"] = config["rule-providers"] || {};
  config.rules = config.rules || [];

  // =========================================================
  // 全局内核优化
  // =========================================================

  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["global-client-fingerprint"] = "chrome";
  // 记住面板里的手动选择（mihomo 默认开启，这里显式写上）
  config.profile = { ...(config.profile || {}), "store-selected": true };

  // =========================================================
  // 节点提取与清洗
  // =========================================================

  const unique = arr => [...new Set(arr.filter(Boolean))];

  const EXCLUDE_NODE_REGEX =
    /(?:官网|套餐|剩余(?:流量)?|流量(?:剩余)?|到期|过期|订阅|客服|公告|Expire|Traffic|Subscription|Reset)/i;

  const usableProxyNames = config.proxies
    .map(p => p && p.name)
    .filter(n => typeof n === "string" && n.trim())
    .filter(n => !EXCLUDE_NODE_REGEX.test(n));

  // =========================================================
  // 节点地区分类
  // =========================================================

  // 游戏专线节点：单独成组，并从各地区组中排除（与 Loon 一致）
  const GAME_REGEX = /游戏|🎮|(?:^|[^A-Za-z])GAME(?:\d+)?(?:$|[^A-Za-z])/i;
  const gameNodes = usableProxyNames.filter(n => GAME_REGEX.test(n));
  const regionPool = usableProxyNames.filter(n => !GAME_REGEX.test(n));

  // 顺序 = 兜底组的故障转移顺序
  const REGIONS = [
    { key: "HK", label: "香港", regex: /(?:^|[^A-Za-z])(HK|HKG)(?:\d+)?(?:$|[^A-Za-z])|香港|Hong[\s_-]*Kong|🇭🇰/i },
    { key: "TW", label: "台湾", regex: /(?:^|[^A-Za-z])(TW|TWN)(?:\d+)?(?:$|[^A-Za-z])|台湾|臺灣|Taiwan|🇹🇼/i },
    { key: "JP", label: "日本", regex: /(?:^|[^A-Za-z])(JP|JPN)(?:\d+)?(?:$|[^A-Za-z])|日本|Japan|东京|東京|大阪|埼玉|川日|泉日|🇯🇵/i },
    { key: "KR", label: "韩国", regex: /(?:^|[^A-Za-z])(KR|KOR)(?:\d+)?(?:$|[^A-Za-z])|韩国|韓國|韓|首尔|首爾|Korea|🇰🇷/i },
    { key: "SG", label: "新加坡", regex: /(?:^|[^A-Za-z])(SG|SGP)(?:\d+)?(?:$|[^A-Za-z])|新加坡|Singapore|狮城|獅城|🇸🇬/i },
    { key: "US", label: "美国", regex: /(?:^|[^A-Za-z])(US|USA)(?:\d+)?(?:$|[^A-Za-z])|美国|美國|United[\s_-]*States|洛杉矶|洛杉磯|西雅图|西雅圖|硅谷|圣何塞|芝加哥|达拉斯|波特兰|凤凰城|拉斯维加斯|🇺🇸/i }
  ];

  const classified = new Set();
  REGIONS.forEach(r => {
    // 一个节点只归入第一个匹配的地区，避免重复
    r.nodes = regionPool.filter(n => !classified.has(n) && r.regex.test(n));
    r.nodes.forEach(n => classified.add(n));
  });
  REGIONS.push({ key: "OT", label: "其他", nodes: regionPool.filter(n => !classified.has(n)) });

  // =========================================================
  // 健康检查参数
  // =========================================================

  const TEST_URL = "https://cp.cloudflare.com/generate_204";
  const TEST_INTERVAL = 300;
  const TEST_TIMEOUT = 3000;
  const TEST_TOLERANCE = 50; // 与 Loon 一致：延迟差 < 50ms 不切换，减少抖动

  const healthCheck = {
    url: TEST_URL,
    interval: TEST_INTERVAL,
    timeout: TEST_TIMEOUT,
    lazy: false,
    "expected-status": "204"
  };

  // =========================================================
  // 组名
  // =========================================================

  const G_MAIN = "🚀 节点选择";
  const G_MANUAL = "🧭 手动选择";
  const G_FALLBACK = "♻️ 兜底自动";
  const G_GAME = "🎮 游戏手动";
  const autoName = r => `${r.label}自动`;
  const manualName = r => `${r.label}手动`;

  // =========================================================
  // 地区组：自动（url-test）+ 手动（select）
  // =========================================================

  const activeRegions = REGIONS.filter(r => r.nodes.length > 0);
  const existing = new Set(); // 记录实际创建了的组名

  const regionAutoGroups = activeRegions.map(r => {
    existing.add(autoName(r));
    return {
      name: autoName(r),
      type: "url-test",
      proxies: unique(r.nodes),
      tolerance: TEST_TOLERANCE,
      ...healthCheck
    };
  });

  const regionManualGroups = activeRegions.map(r => {
    existing.add(manualName(r));
    return { name: manualName(r), type: "select", proxies: unique(r.nodes) };
  });

  const gameGroup = gameNodes.length
    ? { name: G_GAME, type: "select", proxies: unique(gameNodes) }
    : null;
  if (gameGroup) existing.add(G_GAME);

  // =========================================================
  // 兜底组：按地区顺序 fallback
  // =========================================================

  const fallbackGroup = regionAutoGroups.length
    ? {
        name: G_FALLBACK,
        type: "fallback",
        proxies: regionAutoGroups.map(g => g.name),
        ...healthCheck,
        "max-failed-times": 1
      }
    : null;
  if (fallbackGroup) existing.add(G_FALLBACK);

  // =========================================================
  // 主选择器 & 手动选择器
  // =========================================================

  const autoNames = regionAutoGroups.map(g => g.name);
  const manualNames = regionManualGroups.map(g => g.name);

  const mainSelectGroup = {
    name: G_MAIN,
    type: "select",
    // 不放 DIRECT，杜绝误走直连
    proxies: unique([fallbackGroup && G_FALLBACK, ...autoNames, ...manualNames, G_MANUAL])
  };

  const manualSelectGroup = {
    name: G_MANUAL,
    type: "select",
    proxies: unique([...usableProxyNames, "DIRECT"])
  };
  if (manualSelectGroup.proxies.length === 1) manualSelectGroup.proxies.unshift("REJECT");

  existing.add(G_MAIN);
  existing.add(G_MANUAL);

  // =========================================================
  // 分流组定义表 —— 以后增删服务只改这里
  //   sets:   对应 rule-providers 的 key
  //   prefer: 默认出口（不存在时自动退回 🚀 节点选择）
  //   direct: 选项里是否提供 DIRECT
  // =========================================================

  const SERVICES = [
    { name: "🤖 AI",       sets: ["ai", "openai"],          prefer: ["美国手动", "美国自动"] },
    { name: "📲 Telegram", sets: ["telegram"],              prefer: [G_FALLBACK] },
    { name: "📹 YouTube",  sets: ["youtube"],               prefer: [G_MAIN] },
    { name: "🎥 Netflix",  sets: ["netflix"],               prefer: [G_MAIN] },
    { name: "🎵 Spotify",  sets: ["spotify"],               prefer: [G_MAIN] },
    { name: "🎶 TikTok",   sets: ["tiktok"],                prefer: ["新加坡手动", "新加坡自动"] },
    { name: "🔍 Google",   sets: ["google"],                prefer: [G_MAIN] },
    { name: "🐱 GitHub",   sets: ["github"],                prefer: [G_MAIN] },
    { name: "🍎 Apple",    sets: ["apple"],                 prefer: [G_MAIN], direct: true },
    { name: "Ⓜ️ 微软",     sets: ["onedrive", "microsoft"], prefer: [G_MAIN], direct: true },
    { name: "🎮 Steam",    sets: ["steam"],                 prefer: [G_MAIN], direct: true, game: true }
  ];
  const G_FINAL = "🐟 漏网之鱼";

  const buildServiceGroup = (name, prefer, { direct = false, game = false } = {}) => {
    const first = prefer.find(p => existing.has(p)) || G_MAIN;
    return {
      name,
      type: "select",
      proxies: unique([
        first,
        G_MAIN,
        fallbackGroup && G_FALLBACK,
        ...autoNames,
        ...manualNames,
        game && gameGroup && G_GAME,
        G_MANUAL,
        direct && "DIRECT"
      ])
    };
  };

  const serviceGroups = SERVICES.map(s => buildServiceGroup(s.name, s.prefer, s));
  const finalGroup = buildServiceGroup(G_FINAL, [G_MAIN], { direct: true });

  // =========================================================
  // 清除旧组（含 v9 遗留组名），按顺序注入
  // =========================================================

  const ourGroups = [
    mainSelectGroup,
    ...serviceGroups,
    finalGroup,
    manualSelectGroup,
    fallbackGroup,
    ...regionAutoGroups,
    ...regionManualGroups,
    gameGroup
  ].filter(Boolean);

  const LEGACY_GROUPS = [
    "亚洲自动策略", "全球自动策略", "日本自动策略", "新国自动策略", "台湾自动策略",
    "香港自动策略", "美国自动策略", "其他自动策略", "韩国自动策略"
  ];
  const removeNames = new Set([...ourGroups.map(g => g.name), ...LEGACY_GROUPS]);

  config["proxy-groups"] = [
    ...ourGroups,
    ...config["proxy-groups"].filter(g => g && !removeNames.has(g.name))
  ];

  // =========================================================
  // Rule Providers
  // =========================================================

  const META_RULE_BASE = "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta";

  const geosite = name => ({
    type: "http",
    behavior: "domain",
    format: "mrs",
    url: `${META_RULE_BASE}/geo/geosite/${name}.mrs`,
    path: `./ruleset/MetaCubeX/geosite/${name}.mrs`,
    interval: 86400,
    proxy: "DIRECT"
  });

  const geoip = name => ({
    type: "http",
    behavior: "ipcidr",
    format: "mrs",
    url: `${META_RULE_BASE}/geo/geoip/${name}.mrs`,
    path: `./ruleset/MetaCubeX/geoip/${name}.mrs`,
    interval: 86400,
    proxy: "DIRECT"
  });

  config["rule-providers"] = {
    ...config["rule-providers"],
    ads: geosite("category-ads-all"),
    private: geosite("private"),
    cn: geosite("cn"),
    geolocation_non_cn: geosite("geolocation-!cn"),
    geoip_private: geoip("private"),
    geoip_cn: geoip("cn"),
    ai: geosite("category-ai-!cn"), // 覆盖 OpenAI / Claude / Gemini 等
    openai: geosite("openai"),
    apple: geosite("apple"),
    google: geosite("google"),
    github: geosite("github"),
    microsoft: geosite("microsoft"),
    onedrive: geosite("onedrive"),
    telegram: geosite("telegram"),
    geoip_telegram: geoip("telegram"),
    youtube: geosite("youtube"),
    netflix: geosite("netflix"),
    spotify: geosite("spotify"),
    tiktok: geosite("tiktok"),
    steam_cn: geosite("steam@cn"),
    games_cn: geosite("category-games@cn"),
    steam: geosite("steam")
  };

  // =========================================================
  // Rules
  // =========================================================

  const serviceRules = SERVICES.flatMap(s => s.sets.map(set => `RULE-SET,${set},${s.name}`));

  config.rules = [
    "DOMAIN-SUFFIX,yuchsh.top,DIRECT",
    "DOMAIN,clash.razord.top,DIRECT",
    "DOMAIN,yacd.haishan.me,DIRECT",

    "RULE-SET,private,DIRECT",
    "RULE-SET,geoip_private,DIRECT,no-resolve",

    "RULE-SET,ads,REJECT",

    "DOMAIN-SUFFIX,steamcontent.com,DIRECT",
    "DOMAIN-SUFFIX,steamserver.net,DIRECT",
    "DOMAIN-SUFFIX,steamchina.com,DIRECT",
    "RULE-SET,steam_cn,DIRECT",
    "RULE-SET,games_cn,DIRECT",

    ...serviceRules,
    "RULE-SET,geoip_telegram,📲 Telegram,no-resolve",

    "RULE-SET,cn,DIRECT",
    "RULE-SET,geoip_cn,DIRECT,no-resolve",
    "GEOIP,CN,DIRECT",

    `RULE-SET,geolocation_non_cn,${G_FINAL}`,
    `MATCH,${G_FINAL}`
  ];

  return config;
}
