// =========================================================
// mihomo_override_final.js
//
// 1. 地区自动策略组使用 load-balance + sticky-sessions
// 2. 最小地区组使用 sticky-sessions；亚洲和全球组使用 fallback 优先级
// 3. sticky-sessions 根据“源 IP + 目标域名/IP”尽量保持节点稳定
// 4. 移除 🚀 节点选择中的 DIRECT，避免自动策略退避到直连
// 5. 使用较短健康检查超时；自动组成员不含 DIRECT
// =========================================================

function main(config) {
  // 覆写脚本可能收到不完整配置，先保证类型正确。
  config.proxies = Array.isArray(config.proxies) ? config.proxies : [];
  config["proxy-groups"] = Array.isArray(config["proxy-groups"])
    ? config["proxy-groups"]
    : [];
  config["rule-providers"] =
    config["rule-providers"] && typeof config["rule-providers"] === "object"
      ? config["rule-providers"]
      : {};
  config.rules = Array.isArray(config.rules) ? config.rules : [];

  // =========================================================
  // 全局内核优化
  // =========================================================

  // 这些是行为选项，不是“节点测速/负载均衡”参数。
  // tcp-concurrent 会并发尝试同一目标的多个解析地址，可能增加连接数。
  const OVERRIDE_EXISTING_GLOBAL_OPTIONS = true;
  const ENABLE_UNIFIED_DELAY = true;
  const ENABLE_TCP_CONCURRENT = true;
  const GLOBAL_CLIENT_FINGERPRINT = "chrome";

  if (OVERRIDE_EXISTING_GLOBAL_OPTIONS || config["unified-delay"] === undefined) {
    config["unified-delay"] = ENABLE_UNIFIED_DELAY;
  }
  if (OVERRIDE_EXISTING_GLOBAL_OPTIONS || config["tcp-concurrent"] === undefined) {
    config["tcp-concurrent"] = ENABLE_TCP_CONCURRENT;
  }
  if (
    OVERRIDE_EXISTING_GLOBAL_OPTIONS ||
    config["global-client-fingerprint"] === undefined
  ) {
    config["global-client-fingerprint"] = GLOBAL_CLIENT_FINGERPRINT;
  }

  // 对 DoH/DoT 等 DNS 请求使用加密 DNS 时，可取消注释并按需修改。
  // 不建议在不了解 DNS 依赖关系时盲目开启 fake-ip-filter。
  // config.dns = {
  //   ...(config.dns || {}),
  //   enable: true,
  //   enhanced-mode: "fake-ip",
  //   "fake-ip-range": "198.18.0.1/16",
  //   "fake-ip-filter-mode": "blacklist"
  // };

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

  const BUILTIN_PROXY_NAMES = new Set([
    "DIRECT",
    "REJECT",
    "REJECT-DROP",
    "PASS",
    "COMPATIBLE"
  ]);

  const usableProxyNames = rawProxyNames.filter(
    name =>
      !BUILTIN_PROXY_NAMES.has(name) &&
      !EXCLUDE_NODE_REGEX.test(name)
  );

  // =========================================================
  // 节点地区分类
  // =========================================================

  // 按此顺序进行首次匹配，避免一个名称同时命中多个地区组。
  const REGION_DEFINITIONS = [
    {
      group: "日本自动策略",
      regex: /(?:^|[^A-Za-z])(JP|JPN)(?:\d+)?(?:$|[^A-Za-z])|日本|Japan|东京|東京|大阪|埼玉|🇯🇵/i
    },
    {
      group: "新国自动策略",
      regex: /(?:^|[^A-Za-z])(SG|SGP)(?:\d+)?(?:$|[^A-Za-z])|新加坡|Singapore|狮城|獅城|🇸🇬/i
    },
    {
      group: "台湾自动策略",
      regex: /(?:^|[^A-Za-z])(TW|TWN)(?:\d+)?(?:$|[^A-Za-z])|台湾|臺灣|Taiwan|🇹🇼/i
    },
    {
      group: "香港自动策略",
      regex: /(?:^|[^A-Za-z])(HK|HKG)(?:\d+)?(?:$|[^A-Za-z])|香港|Hong[\s_-]*Kong|🇭🇰/i
    },
    {
      group: "美国自动策略",
      regex: /(?:^|[^A-Za-z])(US|USA)(?:\d+)?(?:$|[^A-Za-z])|美国|美國|United[\s_-]*States|洛杉矶|洛杉磯|西雅图|西雅圖|🇺🇸/i
    }
  ];

  const nodesByRegion = Object.fromEntries(
    REGION_DEFINITIONS.map(({ group }) => [group, []])
  );

  const classifiedNodes = new Set();

  for (const name of usableProxyNames) {
    const definition = REGION_DEFINITIONS.find(({ regex }) => regex.test(name));

    if (definition) {
      nodesByRegion[definition.group].push(name);
      classifiedNodes.add(name);
    }
  }

  // 未识别且疑似中国大陆的节点不进入自动代理组，但仍保留在手动选择组。
  const MAINLAND_NODE_REGEX =
    /(?:^|[^A-Za-z])(CN|CHN)(?:\d+)?(?:$|[^A-Za-z])|中国大陆|中国内地|大陆节点|直连节点|广州|深圳|北京|上海|杭州|China Mainland|Mainland China/i;

  const EXCLUDE_MAINLAND_FROM_OTHER = true;

  const otherNodes = usableProxyNames.filter(
    name =>
      !classifiedNodes.has(name) &&
      (!EXCLUDE_MAINLAND_FROM_OTHER || !MAINLAND_NODE_REGEX.test(name))
  );

  const jpNodes = nodesByRegion["日本自动策略"];
  const sgNodes = nodesByRegion["新国自动策略"];
  const twNodes = nodesByRegion["台湾自动策略"];
  const hkNodes = nodesByRegion["香港自动策略"];
  const usNodes = nodesByRegion["美国自动策略"];

  // =========================================================
  // 健康检查参数
  // =========================================================

  // =========================================================
  // 可调参数
  // =========================================================

  // 只有最小地区组（日本/新加坡/台湾/香港/美国/其他）使用负载均衡。
  // 上层亚洲和全球组使用 fallback，严格按下面 proxies 的顺序故障转移。
  const AUTO_STRATEGY = "sticky-sessions";
  const TEST_URL = "https://cp.cloudflare.com/generate_204";
  const TEST_INTERVAL = 300; // 秒
  const TEST_TIMEOUT = 3000; // 毫秒
  const TEST_EXPECTED_STATUS = "200-399";
  const MAX_FAILED_TIMES = 1;
  const LAZY_HEALTH_CHECK = false;
  const DISABLE_UDP = false;
  const STORE_SELECTED_GROUP = true;
  // 自动组没有有效成员时拒绝连接，避免隐式回落到直连/兼容模式。
  // 这不是节点全部失效时的切换策略；节点全部失效时仍应由健康状态和上层规则处理。
  const EMPTY_FALLBACK = "REJECT";

  // 是否保留原配置中的 rules。
  // 保留时会把本脚本规则放在原规则之前，避免原 MATCH 提前截获请求。
  const PRESERVE_EXISTING_RULES = false;

  // 是否覆盖同名 rule-providers。
  // true：确保使用下面定义的 URL/path；false：保留原有同名 provider。
  const OVERWRITE_MANAGED_PROVIDERS = true;

  // 规则集下载通道。DIRECT 可避免启动时形成代理组依赖环；
  // 如果直连无法访问 CDN，可改为一个稳定的代理组。
  const RULE_PROVIDER_PROXY = "DIRECT";

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
  // - max-failed-times 控制策略组连续拨号失败后触发健康检查，
  //   并不等于“节点失败 1 次后立即永久剔除”；
  // - sticky-sessions 不是按节点顺序 fallback；
  // - 同一来源访问同一目标时，会尽量复用之前的节点。
  // =========================================================

  const createAutoLoadBalance = (name, proxies) => {
    const members = unique(proxies);

    if (members.length === 0) {
      return null;
    }

    return {
      name,
      type: "load-balance",
      strategy: AUTO_STRATEGY,
      proxies: members,
      url: TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: LAZY_HEALTH_CHECK,
      "disable-udp": DISABLE_UDP,
      "expected-status": TEST_EXPECTED_STATUS,
      "max-failed-times": MAX_FAILED_TIMES,
      "empty-fallback": EMPTY_FALLBACK
    };
  };

  // 创建按成员顺序故障转移的 fallback 组。
  const createAutoFallback = (name, proxies) => {
    const members = unique(proxies);

    if (members.length === 0) {
      return null;
    }

    return {
      name,
      type: "fallback",
      proxies: members,
      url: TEST_URL,
      interval: TEST_INTERVAL,
      timeout: TEST_TIMEOUT,
      lazy: LAZY_HEALTH_CHECK,
      "disable-udp": DISABLE_UDP,
      "expected-status": TEST_EXPECTED_STATUS,
      "max-failed-times": MAX_FAILED_TIMES,
      "empty-fallback": EMPTY_FALLBACK
    };
  };

  // =========================================================
  // 地区自动策略组
  // =========================================================

  const createdRegionGroups = [];

  const createRegionLoadBalance = (name, nodes) => {
    const group = createAutoLoadBalance(name, nodes);

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
  // 按日本 → 新加坡 → 台湾 → 香港的顺序 fallback。
  // 亚洲组本身不使用 load-balance。
  // =========================================================

  const asiaCandidates = [
    "日本自动策略",
    "新国自动策略",
    "台湾自动策略",
    "香港自动策略"
  ].filter(name => createdRegionGroups.includes(name));

  const asiaFallbackGroup = createAutoFallback(
    "亚洲自动策略",
    asiaCandidates
  );

  const hasAsiaFallback = !!asiaFallbackGroup;

  // =========================================================
  // 全球自动策略组
  // 亚洲 → 美国 → 其他地区，按顺序 fallback。
  // 全球组本身不使用 load-balance。
  // =========================================================

  const globalCandidates = [];

  if (hasAsiaFallback) {
    globalCandidates.push("亚洲自动策略");
  }

  if (createdRegionGroups.includes("美国自动策略")) {
    globalCandidates.push("美国自动策略");
  }

  if (createdRegionGroups.includes("其他自动策略")) {
    globalCandidates.push("其他自动策略");
  }

  const globalFallbackGroup = createAutoFallback(
    "全球自动策略",
    globalCandidates
  );

  const hasGlobalFallback = !!globalFallbackGroup;

  // =========================================================
  // 主选择器与手动选择器
  // =========================================================

  const mainSelectProxies = [];

  if (hasGlobalFallback) {
    mainSelectProxies.push("全球自动策略");
  }

  if (hasAsiaFallback) {
    mainSelectProxies.push("亚洲自动策略");
  }

  // 主选择器中加入各地区自动策略，但不加入 DIRECT
  mainSelectProxies.push(...createdRegionGroups);

  // 没有任何可用节点时，主选择器默认拒绝连接，而不是通过手动组默认直连。
  if (mainSelectProxies.length === 0) {
    mainSelectProxies.push("REJECT");
  }

  mainSelectProxies.push("🧭 手动选择");

  const mainSelectGroup = {
    name: "🚀 节点选择",
    type: "select",
    proxies: unique(mainSelectProxies)
  };

  const manualSelectProxies = [];

  if (hasGlobalFallback) {
    manualSelectProxies.push("全球自动策略");
  }

  if (hasAsiaFallback) {
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
    globalFallbackGroup,
    asiaFallbackGroup,
    ...regionGroups
  ].filter(Boolean);

  config["proxy-groups"].unshift(...orderedProxyGroups);

  // 仅持久化 select 组的当前选择；不会持久化 sticky-sessions 的内部缓存。
  if (STORE_SELECTED_GROUP) {
    config.profile = {
      ...(config.profile || {}),
      "store-selected": true
    };
  }

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
    proxy: RULE_PROVIDER_PROXY
  });

  const createGeoipProvider = name => ({
    type: "http",
    behavior: "ipcidr",
    format: "mrs",
    url: `${META_RULE_BASE}/geo/geoip/${name}.mrs`,
    path: `./ruleset/MetaCubeX/geoip/${name}.mrs`,
    interval: 86400,
    proxy: RULE_PROVIDER_PROXY
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

  config["rule-providers"] = OVERWRITE_MANAGED_PROVIDERS
    ? {
        ...config["rule-providers"],
        ...managedRuleProviders
      }
    : {
        ...managedRuleProviders,
        ...config["rule-providers"]
      };

  // =========================================================
  // Rules
  // =========================================================

  const managedRules = [
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

    "RULE-SET,geolocation_non_cn,🚀 节点选择"
  ];

  const existingRules = Array.isArray(config.rules) ? config.rules : [];

  // 删除原配置末尾的 MATCH/FINAL，避免它阻断本脚本规则。
  const existingRulesWithoutCatchAll = existingRules.filter(rule => {
    if (typeof rule !== "string") return true;
    return !/^(MATCH|FINAL)(?:,|$)/i.test(rule.trim());
  });

  const finalRule = "MATCH,🚀 节点选择";

  config.rules = PRESERVE_EXISTING_RULES
    ? [...managedRules, ...existingRulesWithoutCatchAll, finalRule]
    : [...managedRules, finalRule];

  return config;
}
