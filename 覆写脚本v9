// =========================================================
// mihomo_override_final.js
// Part 1/3
// Proxy architecture:
// nodes
//   -> region url-test
//   -> Asia fallback
//   -> Global fallback
//   -> selector
// =========================================================

function main(config) {

  config.proxies = config.proxies || [];
  config["proxy-groups"] = config["proxy-groups"] || [];
  config["rule-providers"] = config["rule-providers"] || {};
  config.rules = config.rules || [];


  // =========================================================
  // Utils
  // =========================================================

  const unique = arr => [
    ...new Set(
      arr.filter(Boolean)
    )
  ];


  const EXCLUDE_NODE_REGEX =
    /(?:官网|套餐|剩余(?:流量)?|流量(?:剩余)?|到期|过期|订阅|客服|公告|Expire|Traffic|Subscription|Reset)/i;


  const allProxyNames = unique(
    config.proxies
      .map(p => p && p.name)
      .filter(
        n => typeof n === "string" && n.trim()
      )
  );


  const usableProxyNames =
    allProxyNames.filter(
      n => !EXCLUDE_NODE_REGEX.test(n)
    );



  // =========================================================
  // Node classify
  // =========================================================

  const filterNodes = regex =>
    usableProxyNames.filter(
      n => regex.test(n)
    );


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


  const otherNodes =
    usableProxyNames.filter(
      n => !classifiedNodes.has(n)
    );



  // =========================================================
  // Health check
  // =========================================================

  const TEST_URL =
    "http://www.gstatic.com/generate_204";


  const TEST_INTERVAL = 300;


  const TEST_TIMEOUT = 5000;


  const TEST_TOLERANCE = 300;



  // =========================================================
  // Remove old groups
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


  config["proxy-groups"] =
    config["proxy-groups"].filter(
      g =>
        g &&
        !removeGroups.includes(g.name)
    );



  // =========================================================
  // Region url-test
  // Only here performs node health check
  // =========================================================

  const createUrlTest =
    (name, nodes) => {

      if (!nodes.length)
        return null;


      return {

        name,

        type:"url-test",

        proxies:unique(nodes),

        url:TEST_URL,

        interval:TEST_INTERVAL,

        timeout:TEST_TIMEOUT,

        tolerance:TEST_TOLERANCE,

        lazy:true,

        "expected-status":204,

        "max-failed-times":2
      };
    };



  const proxyGroups = [];


  proxyGroups.push(

    createUrlTest(
      "日本自动策略",
      jpNodes
    ),


    createUrlTest(
      "新国自动策略",
      sgNodes
    ),


    createUrlTest(
      "台湾自动策略",
      twNodes
    ),


    createUrlTest(
      "香港自动策略",
      hkNodes
    ),


    createUrlTest(
      "美国自动策略",
      usNodes
    ),


    createUrlTest(
      "其他自动策略",
      otherNodes
    )

  );



  // =========================================================
  // Asia fallback
  // =========================================================

  proxyGroups.push({

    name:"亚洲自动策略",

    type:"fallback",

    proxies:[

      "日本自动策略",

      "新国自动策略",

      "台湾自动策略",

      "香港自动策略"

    ],

    url:TEST_URL,

    interval:TEST_INTERVAL,

    timeout:TEST_TIMEOUT,

    lazy:true

  });



  // =========================================================
  // Global fallback
  // Asia -> US -> Other
  // =========================================================

  proxyGroups.push({

    name:"全球自动策略",

    type:"fallback",

    proxies:[

      "亚洲自动策略",

      "美国自动策略",

      "其他自动策略"

    ],

    url:TEST_URL,

    interval:TEST_INTERVAL,

    timeout:TEST_TIMEOUT,

    lazy:true

  });
  // =========================================================
// Part 2/3
// Main selector + Rule Providers
// =========================================================



  // =========================================================
  // Main selector
  // =========================================================

  proxyGroups.push({

    name:"🚀 节点选择",

    type:"select",

    proxies:[

      "全球自动策略",

      "亚洲自动策略",

      "美国自动策略",

      "其他自动策略",

      "🧭 手动选择",

      "DIRECT"

    ]

  });



  // =========================================================
  // Manual selector
  //
  // select 类型不会产生健康检查
  // 原始节点只用于人工切换
  // =========================================================

  proxyGroups.push({

    name:"🧭 手动选择",

    type:"select",

    proxies:unique([

      "全球自动策略",

      "亚洲自动策略",

      "日本自动策略",

      "新国自动策略",

      "台湾自动策略",

      "香港自动策略",

      "美国自动策略",

      "其他自动策略",

      ...usableProxyNames,

      "DIRECT"

    ])

  });



  // =========================================================
  // Apply proxy groups
  // =========================================================

  config["proxy-groups"].unshift(

    ...proxyGroups.filter(Boolean)

  );



  // =========================================================
  // Rule Providers
  // MetaCubeX meta-rules-dat
  // =========================================================

  const META_RULE_BASE =

    "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta";



  const createGeositeProvider = name => ({

    type:"http",

    behavior:"domain",

    format:"mrs",

    url:

      `${META_RULE_BASE}/geo/geosite/${name}.mrs`,

    path:

      `./ruleset/MetaCubeX/geosite/${name}.mrs`,

    interval:86400,

    proxy:"🚀 节点选择"

  });



  const createGeoipProvider = name => ({

    type:"http",

    behavior:"ipcidr",

    format:"mrs",

    url:

      `${META_RULE_BASE}/geo/geoip/${name}.mrs`,

    path:

      `./ruleset/MetaCubeX/geoip/${name}.mrs`,

    interval:86400,

    proxy:"🚀 节点选择"

  });



  const managedRuleProviders = {


    // 基础

    ads:
      createGeositeProvider(
        "category-ads-all"
      ),


    private:
      createGeositeProvider(
        "private"
      ),


    cn:
      createGeositeProvider(
        "cn"
      ),


    geolocation_non_cn:
      createGeositeProvider(
        "geolocation-!cn"
      ),



    // IP

    geoip_private:
      createGeoipProvider(
        "private"
      ),


    geoip_cn:
      createGeoipProvider(
        "cn"
      ),



    // 服务

    apple:
      createGeositeProvider(
        "apple"
      ),


    google:
      createGeositeProvider(
        "google"
      ),


    github:
      createGeositeProvider(
        "github"
      ),


    microsoft:
      createGeositeProvider(
        "microsoft"
      ),


    onedrive:
      createGeositeProvider(
        "onedrive"
      ),


    openai:
      createGeositeProvider(
        "openai"
      ),


    telegram:
      createGeositeProvider(
        "telegram"
      ),


    youtube:
      createGeositeProvider(
        "youtube"
      ),


    netflix:
      createGeositeProvider(
        "netflix"
      ),


    spotify:
      createGeositeProvider(
        "spotify"
      ),


    tiktok:
      createGeositeProvider(
        "tiktok"
      ),



    // 游戏

    steam_cn:
      createGeositeProvider(
        "steam@cn"
      ),


    games_cn:
      createGeositeProvider(
        "category-games@cn"
      ),


    steam:
      createGeositeProvider(
        "steam"
      )

  };



  config["rule-providers"] = {

    ...config["rule-providers"],

    ...managedRuleProviders

  };
  // =========================================================
// Part 3/3
// Rules
// =========================================================


  config.rules = [

    // =====================================================
    // 自定义直连
    // =====================================================

    "DOMAIN-SUFFIX,yuchsh.top,DIRECT",


    // Clash / Yacd

    "DOMAIN,clash.razord.top,DIRECT",

    "DOMAIN,yacd.haishan.me,DIRECT",



    // =====================================================
    // Private
    // =====================================================

    "RULE-SET,private,DIRECT",

    "RULE-SET,geoip_private,DIRECT,no-resolve",



    // =====================================================
    // Ads
    // =====================================================

    "RULE-SET,ads,REJECT",



    // =====================================================
    // Steam 国内 CDN
    // Steam 下载直连
    // Steam 商店/社区走代理
    // =====================================================


    "DOMAIN-SUFFIX,steamcontent.com,DIRECT",

    "DOMAIN-SUFFIX,steamserver.net,DIRECT",

    "DOMAIN-SUFFIX,steamchina.com,DIRECT",


    "RULE-SET,steam_cn,DIRECT",

    "RULE-SET,games_cn,DIRECT",



    // =====================================================
    // 海外服务
    // 全部统一进入节点选择
    // 不再创建独立业务代理组
    // =====================================================


    "RULE-SET,github,🚀 节点选择",


    "RULE-SET,apple,🚀 节点选择",


    "RULE-SET,onedrive,🚀 节点选择",


    "RULE-SET,microsoft,🚀 节点选择",


    "RULE-SET,openai,🚀 节点选择",


    "RULE-SET,telegram,🚀 节点选择",



    // =====================================================
    // Streaming
    // =====================================================


    "RULE-SET,youtube,🚀 节点选择",

    "RULE-SET,netflix,🚀 节点选择",

    "RULE-SET,spotify,🚀 节点选择",

    "RULE-SET,tiktok,🚀 节点选择",



    // =====================================================
    // Google
    // =====================================================

    "RULE-SET,google,🚀 节点选择",



    // =====================================================
    // Steam 海外
    // =====================================================

    "RULE-SET,steam,🚀 节点选择",



    // =====================================================
    // 中国大陆直连
    // =====================================================

    "RULE-SET,cn,DIRECT",

    "RULE-SET,geoip_cn,DIRECT,no-resolve",

    "GEOIP,CN,DIRECT",



    // =====================================================
    // 非中国区域
    // =====================================================

    "RULE-SET,geolocation_non_cn,🚀 节点选择",



    // =====================================================
    // Final
    // =====================================================

    "MATCH,🚀 节点选择"

  ];



  return config;

}
