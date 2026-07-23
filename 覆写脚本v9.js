// =========================================================
// mihomo_override_final.js
// 1. 地区策略组全部采用 fallback 模式（按节点顺序故障转移）
// 2. 移除 🚀 节点选择 中的 DIRECT 选项，杜绝自动退避走直连
// 3. 优化 fallback 响应速度（timeout: 3000ms, max-failed-times: 1）
// =========================================================

function main(config) {

  config.proxies = config.proxies || [];
  config["proxy-groups"] = config["proxy-groups"] || [];
  config["rule-providers"] = config["rule-providers"] || {};
  config.rules = config.rules || [];

  // =========================================================
  // 全局内核优化
  // =========================================================

  config["unified-delay"] = true; // RTT 统一延迟计算
  config["tcp-concurrent"] = true; // TCP 并发握手
  config["global-client-fingerprint"] = "chrome"; // TLS 指纹伪装

  // =========================================================
  // 节点提取与清洗
  // =========================================================

  const unique = arr => [...new Set(arr.filter(Boolean))];

  const EXCLUDE_NODE_REGEX =
    /(?:官网|套餐|剩余(?:流量)?|流量(?:剩余)?|到期|过期|订阅|客服|公告|Expire|Traffic|Subscription|Reset)/i;

  let rawProxyNames = config.proxies
    .map(p => p && p.name)
    .filter(n => typeof n === "string" && n.trim());

  const usableProxyNames = rawProxyNames.filter(n => !EXCLUDE_NODE_REGEX.test(n));

  // =========================================================
  // 节点地区分类
  // =========================================================

  const filterNodes = regex => usableProxyNames.filter(n => regex.test(n));

  const jpNodes = filterNodes(/(?:^|[^A-Za-z])(JP|JPN)(?:\d+)?(?:$|[^A-Za-z])|日本|Japan|东京|東京|大阪|埼玉|🇯🇵/i);
  const sgNodes = filterNodes(/(?:^|[^A-Za-z])(SG|SGP)(?:\d+)?(?:$|[^A-Za-z])|新加坡|Singapore|狮城|獅城|🇸🇬/i);
  const twNodes = filterNodes(/(?:^|[^A-Za-z])(TW|TWN)(?:\d+)?(?:$|[^A-Za-z])|台湾|臺灣|Taiwan|🇹🇼/i);
  const hkNodes = filterNodes(/(?:^|[^A-Za-z])(HK|HKG)(?:\d+)?(?:$|[^A-Za-z])|香港|Hong[\s_-]*Kong|🇭🇰/i);
  const usNodes = filterNodes(/(?:^|[^A-Za-z])(US|USA)(?:\d+)?(?:$|[^A-Za-z])|美国|美國|United[\s_-]*States|洛杉矶|洛杉磯|西雅图|西雅圖|🇺🇸/i);

  const classifiedNodes = new Set([...jpNodes, ...sgNodes, ...twNodes, ...hkNodes, ...usNodes]);
  const otherNodes = usableProxyNames.filter(n => !classifiedNodes.has(n));

  // =========================================================
  // 健康检查参数
  // =========================================================

  const TEST_URL = "https://cp.cloudflare.com/generate_204";
  const TEST_INTERVAL = 300;
  const TEST_TIMEOUT = 3000; // 调低超时阈值，加快 fallback 故障切换
  const TEST_TOLERANCE = 150;

  // =========================================================
  // 清除旧策略组
  // =========================================================

  const removeGroups = [
    "🚀 节点选择",
    "🧭 手动选择",
    "亚洲自动策略",
    "全球自动策略",
    "日本自动策略",
    "新国自动策略",
    "台湾自动策略",
    "香港自动策略",
    "美国自动策略",
    "其他自动策略",
    "韩国自动策略"
  ];

  config["proxy-groups"] = config["proxy-groups"].filter(
    g => g && !removeGroups.includes(g.name)
  );

  // =========================================================
  // 地区策略组 (改为 fallback 模式，按节点顺序进行主备切换)
  // =========================================================

  const createdRegionGroups = [];

  const createRegionFallback = (name, nodes) => {
    if (!nodes || nodes.length === 0) return null;
    createdRegionGroups.push(name);
    return {
      name,
      type: "fallback", // 地区组内按照节点顺序 fallback
      proxies: unique(nodes),
      url: TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      tolerance: TEST_TOLERANCE,
      lazy: false,
      "expected-status": "200-399",
      "max-failed-times": 1 // 1 次失败即触发秒切
    };
  };

  const groupJP = createRegionFallback("日本自动策略", jpNodes);
  const groupSG = createRegionFallback("新国自动策略", sgNodes);
  const groupTW = createRegionFallback("台湾自动策略", twNodes);
  const groupHK = createRegionFallback("香港自动策略", hkNodes);
  const groupUS = createRegionFallback("美国自动策略", usNodes);
  const groupOther = createRegionFallback("其他自动策略", otherNodes);

  const regionGroups = [groupJP, groupSG, groupTW, groupHK, groupUS, groupOther].filter(Boolean);

  // =========================================================
  // 跨区策略组 (使用 fallback 进行跨区域故障转移)
  // =========================================================

  const asiaCandidates = ["日本自动策略", "新国自动策略", "台湾自动策略", "香港自动策略"]
    .filter(name => createdRegionGroups.includes(name));

  let asiaFallbackGroup = null;
  let hasAsiaFallback = false;
  if (asiaCandidates.length > 0) {
    asiaFallbackGroup = {
      name: "亚洲自动策略",
      type: "fallback",
      proxies: asiaCandidates,
      url: TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: false
    };
    hasAsiaFallback = true;
  }

  const globalCandidates = [];
  if (hasAsiaFallback) globalCandidates.push("亚洲自动策略");
  if (createdRegionGroups.includes("美国自动策略")) globalCandidates.push("美国自动策略");
  if (createdRegionGroups.includes("其他自动策略")) globalCandidates.push("其他自动策略");

  let globalFallbackGroup = null;
  let hasGlobalFallback = false;
  if (globalCandidates.length > 0) {
    globalFallbackGroup = {
      name: "全球自动策略",
      type: "fallback",
      proxies: globalCandidates,
      url: TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: false
    };
    hasGlobalFallback = true;
  }

  // =========================================================
  // 主选择器与手动选择器
  // =========================================================

  const mainSelectProxies = [];
  if (hasGlobalFallback) mainSelectProxies.push("全球自动策略");
  if (hasAsiaFallback) mainSelectProxies.push("亚洲自动策略");
  mainSelectProxies.push(...createdRegionGroups);
  mainSelectProxies.push("🧭 手动选择"); 
  // 杜绝放置 DIRECT，从根源阻止内核退避到直连

  const mainSelectGroup = {
    name: "🚀 节点选择",
    type: "select",
    proxies: unique(mainSelectProxies)
  };

  const manualSelectProxies = [];
  if (hasGlobalFallback) manualSelectProxies.push("全球自动策略");
  if (hasAsiaFallback) manualSelectProxies.push("亚洲自动策略");
  manualSelectProxies.push(...createdRegionGroups);
  manualSelectProxies.push(...usableProxyNames, "DIRECT");

  const manualSelectGroup = {
    name: "🧭 手动选择",
    type: "select",
    proxies: unique(manualSelectProxies)
  };

  // 组装策略组（主选择器在最顶端）
  const orderedProxyGroups = [
    mainSelectGroup,
    manualSelectGroup,
    globalFallbackGroup,
    asiaFallbackGroup,
    ...regionGroups
  ].filter(Boolean);

  config["proxy-groups"].unshift(...orderedProxyGroups);

  // =========================================================
  // Rule Providers
  // =========================================================

  const META_RULE_BASE = "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta";

  const createGeositeProvider = name => ({
    type: "http",
    behavior: "domain",
    format: "mrs",
    url: `${META_RULE_BASE}/geo/geosite/${name}.mrs`,
    path: `./ruleset/MetaCubeX/geosite/${name}.mrs`,
    interval: 86400,
    proxy: "DIRECT"
  });

  const createGeoipProvider = name => ({
    type: "http",
    behavior: "ipcidr",
    format: "mrs",
    url: `${META_RULE_BASE}/geo/geoip/${name}.mrs`,
    path: `./ruleset/MetaCubeX/geoip/${name}.mrs`,
    interval: 86400,
    proxy: "DIRECT"
  });

  const managedRuleProviders = {
    ads: createGeositeProvider("category-ads-all"),
    private: createGeositeProvider("private"),
    cn: createGeositeProvider("cn"),
    geolocation_non_cn: createGeositeProvider("geolocation-!cn"),
    geoip_private: createGeoipProvider("private"),
    geoip_cn: createGeoipProvider("cn"),
    apple: createGeositeProvider("apple"),
    google: createGeositeProvider("google"),
    github: createGeositeProvider("github"),
    microsoft: createGeositeProvider("microsoft"),
    onedrive: createGeositeProvider("onedrive"),
    openai: createGeositeProvider("openai"),
    telegram: createGeositeProvider("telegram"),
    youtube: createGeositeProvider("youtube"),
    netflix: createGeositeProvider("netflix"),
    spotify: createGeositeProvider("spotify"),
    tiktok: createGeositeProvider("tiktok"),
    steam_cn: createGeositeProvider("steam@cn"),
    games_cn: createGeositeProvider("category-games@cn"),
    steam: createGeositeProvider("steam")
  };

  config["rule-providers"] = {
    ...config["rule-providers"],
    ...managedRuleProviders
  };

  // =========================================================
  // Rules
  // =========================================================

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

    "RULE-SET,github,🚀 节点选择",
    "RULE-SET,apple,🚀 节点选择",
    "RULE-SET,onedrive,🚀 节点选择",
    "RULE-SET,microsoft,🚀 节点选择",
    "RULE-SET,openai,🚀 节点选择",
    "RULE-SET,telegram,🚀 节点选择",

    "RULE-SET,youtube,🚀 节点选择",
    "RULE-SET,netflix,🚀 节点选择",
    "RULE-SET,spotify,🚀 节点选择",
    "RULE-SET,tiktok,🚀 节点选择",

    "RULE-SET,google,🚀 节点选择",
    "RULE-SET,steam,🚀 节点选择",

    "RULE-SET,cn,DIRECT",
    "RULE-SET,geoip_cn,DIRECT,no-resolve",
    "GEOIP,CN,DIRECT",

    "RULE-SET,geolocation_non_cn,🚀 节点选择",
    "MATCH,🚀 节点选择"
  ];

  return config;
}
