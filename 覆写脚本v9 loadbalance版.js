// =========================================================
// mihomo_override_final.js
//
// 1. 地区自动策略组使用 load-balance + sticky-sessions
// 2. 亚洲、全球自动策略组同样使用 sticky-sessions
// 3. sticky-sessions 根据“源 IP + 目标域名/IP”尽量保持节点稳定
// 4. 移除 🚀 节点选择中的 DIRECT，避免自动策略退避到直连
// 5. 使用较短健康检查超时，并在一次失败后触发健康检查
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

  // =========================================================
  // 工具函数
  // =========================================================

  const unique = arr => [...new Set((arr || []).filter(Boolean))];

  // =========================================================
  // 节点提取与清洗
  // =========================================================

  const EXCLUDE_NODE_REGEX =
    /(?:官网|套餐|剩余(?:流量)?|流量(?:剩余)?|到期|过期|订阅|客服|公告|Expire|Traffic|Subscription|Reset)/i;

  const rawProxyNames = config.proxies
    .map(p => p && p.name)
    .filter(name => typeof name === "string" && name.trim());

  const usableProxyNames = rawProxyNames.filter(
    name => !EXCLUDE_NODE_REGEX.test(name)
  );

  // =========================================================
  // 节点地区分类
  // =========================================================

  const filterNodes = regex => usableProxyNames.filter(name => regex.test(name));

  const jpNodes = filterNodes(
    /(?:^|[^A-Za-z])(JP|JPN)(?:\d+)?(?:$|[^A-Za-z])|日本|Japan|东京|東京|大阪|埼玉|🇯🇵/i
  );

  const sgNodes = filterNodes(
    /(?:^|[^A-Za-z])(SG|SGP)(?:\d+)?(?:$|[^A-Za-z])|新加坡|Singapore|狮城|獅城|🇸🇬/i
  );

  const twNodes = filterNodes(
    /(?:^|[^A-Za-z])(TW|TWN)(?:\d+)?(?:$|[^A-Za-z])|台湾|臺灣|Taiwan|🇹🇼/i
  );

  const hkNodes = filterNodes(
    /(?:^|[^A-Za-z])(HK|HKG)(?:\d+)?(?:$|[^A-Za-z])|香港|Hong[\s_-]*Kong|🇭🇰/i
  );

  const usNodes = filterNodes(
    /(?:^|[^A-Za-z])(US|USA)(?:\d+)?(?:$|[^A-Za-z])|美国|美國|United[\s_-]*States|洛杉矶|洛杉磯|西雅图|西雅圖|🇺🇸/i
  );

  const classifiedNodes = new Set([
    ...jpNodes,
    ...sgNodes,
    ...twNodes,
    ...hkNodes,
    ...usNodes
  ]);

  const otherNodes = usableProxyNames.filter(
    name => !classifiedNodes.has(name)
  );

  // =========================================================
  // 健康检查参数
  // =========================================================

  const TEST_URL = "https://cp.cloudflare.com/generate_204";
  const TEST_INTERVAL = 300;
  const TEST_TIMEOUT = 3000;

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
    group => group && !removeGroups.includes(group.name)
  );

  // =========================================================
  // 创建 sticky-sessions 负载均衡组
  // =========================================================
  //
  // 注意：
  // - load-balance 不使用 tolerance 参数；
  // - max-failed-times 控制连续失败后触发健康检查；
  // - sticky-sessions 不是按节点顺序 fallback；
  // - 同一来源访问同一目标时，会尽量复用之前的节点。
  // =========================================================

  const createStickyLoadBalance = (name, proxies) => {
    const members = unique(proxies);

    if (members.length === 0) {
      return null;
    }

    return {
      name,
      type: "load-balance",
      strategy: "sticky-sessions",
      proxies: members,
      url: TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: false,
      "expected-status": "200-399",
      "max-failed-times": 1
    };
  };

  // =========================================================
  // 地区自动策略组
  // =========================================================

  const createdRegionGroups = [];

  const createRegionLoadBalance = (name, nodes) => {
    const group = createStickyLoadBalance(name, nodes);

    if (group) {
      createdRegionGroups.push(name);
    }

    return group;
  };

  const groupJP = createRegionLoadBalance("日本自动策略", jpNodes);
  const groupSG = createRegionLoadBalance("新国自动策略", sgNodes);
  const groupTW = createRegionLoadBalance("台湾自动策略", twNodes);
  const groupHK = createRegionLoadBalance("香港自动策略", hkNodes);
  const groupUS = createRegionLoadBalance("美国自动策略", usNodes);
  const groupOther = createRegionLoadBalance("其他自动策略", otherNodes);

  const regionGroups = [
    groupJP,
    groupSG,
    groupTW,
    groupHK,
    groupUS,
    groupOther
  ].filter(Boolean);

  // =========================================================
  // 亚洲自动策略组
  // =========================================================

  const asiaCandidates = [
    "日本自动策略",
    "新国自动策略",
    "台湾自动策略",
    "香港自动策略"
  ].filter(name => createdRegionGroups.includes(name));

  const asiaLoadBalanceGroup = createStickyLoadBalance(
    "亚洲自动策略",
    asiaCandidates
  );

  const hasAsiaLoadBalance = !!asiaLoadBalanceGroup;

  // =========================================================
  // 全球自动策略组
  // =========================================================

  const globalCandidates = [];

  if (hasAsiaLoadBalance) {
    globalCandidates.push("亚洲自动策略");
  }

  if (createdRegionGroups.includes("美国自动策略")) {
    globalCandidates.push("美国自动策略");
  }

  if (createdRegionGroups.includes("其他自动策略")) {
    globalCandidates.push("其他自动策略");
  }

  const globalLoadBalanceGroup = createStickyLoadBalance(
    "全球自动策略",
    globalCandidates
  );

  const hasGlobalLoadBalance = !!globalLoadBalanceGroup;

  // =========================================================
  // 主选择器与手动选择器
  // =========================================================

  const mainSelectProxies = [];

  if (hasGlobalLoadBalance) {
    mainSelectProxies.push("全球自动策略");
  }

  if (hasAsiaLoadBalance) {
    mainSelectProxies.push("亚洲自动策略");
  }

  // 主选择器中加入各地区自动策略，但不加入 DIRECT
  mainSelectProxies.push(...createdRegionGroups);
  mainSelectProxies.push("🧭 手动选择");

  const mainSelectGroup = {
    name: "🚀 节点选择",
    type: "select",
    proxies: unique(mainSelectProxies)
  };

  const manualSelectProxies = [];

  if (hasGlobalLoadBalance) {
    manualSelectProxies.push("全球自动策略");
  }

  if (hasAsiaLoadBalance) {
    manualSelectProxies.push("亚洲自动策略");
  }

  manualSelectProxies.push(...createdRegionGroups);
  manualSelectProxies.push(...usableProxyNames, "DIRECT");

  const manualSelectGroup = {
    name: "🧭 手动选择",
    type: "select",
    proxies: unique(manualSelectProxies)
  };

  // =========================================================
  // 组装策略组
  // =========================================================

  const orderedProxyGroups = [
    mainSelectGroup,
    manualSelectGroup,
    globalLoadBalanceGroup,
    asiaLoadBalanceGroup,
    ...regionGroups
  ].filter(Boolean);

  config["proxy-groups"].unshift(...orderedProxyGroups);

  // =========================================================
  // Rule Providers
  // =========================================================

  const META_RULE_BASE =
    "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta";

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
