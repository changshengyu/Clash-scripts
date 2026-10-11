
/**
 * sing-box for Android 1.14+ 完整配置生成脚本
 *
 * 使用位置：
 * Sub-Store → 普通文件 → 文件操作 → 脚本操作
 *
 * 脚本链接参数：
 * #type=collection&name=你的组合订阅名称
 *
 * 调试模式：
 * #type=collection&name=你的组合订阅名称&debug=true
 *
 * 不传 name 时：
 * 从普通文件内容解析节点订阅或 Mihomo 配置。
 *
 * 主要功能：
 * 1. Android 默认开启 TUN / VPN
 * 2. 全球节点自动测速
 * 3. 亚洲节点自动测速
 * 4. 日本、新加坡、台湾、香港、美国、其他地区自动分组
 * 5. 手动节点选择
 * 6. 国内直连、海外代理
 * 7. 广告拦截
 * 8. Steam 国内资源直连
 * 9. GitHub / OpenAI / Telegram 等业务分流
 * 10. sing-box 1.14+ HTTP Client 规则集下载
 * 11. 本地 DNS + 代理 DoH
 * 12. Debug 诊断模式
 *
 * 保留已验证可工作的 Sub-Store operator 结构。
 */

const CLIENT = 'singbox';

// 防止主函数异常后错误回退为快捷脚本模式。
if (typeof $content !== 'undefined') {
  throw new Error(
    '配置生成失败，请查看前一条 operator 错误及后端日志'
  );
}

async function operator(input, targetPlatform, context) {

  if (!input || typeof input.$content !== 'string') {
    throw new Error(
      '请在 Sub-Store 普通文件的文件操作中使用本脚本'
    );
  }

  // =========================
  // 1. 基础参数
  // =========================

  const args =
    typeof $arguments === 'object' && $arguments
      ? $arguments
      : {};

  const clone = x =>
    JSON.parse(JSON.stringify(x));

  const warn = msg =>
    console.log(`[${CLIENT}] ${msg}`);

  const encode = obj =>
    JSON.stringify(obj, null, 2);

  // =========================
  // 2. 获取订阅节点
  // =========================

  let raw = args.name
    ? await produceArtifact({
        type: args.type || 'collection',
        name: args.name,
        platform: 'JSON',
        produceType: 'internal'
      })
    : ProxyUtils.parse(input.$content);

  if (!Array.isArray(raw)) {
    throw new Error('节点来源没有返回数组');
  }

  // =========================
  // 3. 过滤无效节点
  // =========================

  const info =
    /官网|套餐|剩余(?:流量)?|流量剩余|到期|过期|订阅|客服|公告|Expire|Traffic|Subscription|Reset/i;

  const main = '🚀 节点选择';
  const manual = '🧭 手动选择';
  const asia = '亚洲自动策略';
  const global = '全球自动策略';

  const reserved = new Set([
    'DIRECT',
    'REJECT',
    main,
    manual,
    asia,
    global,
    '日本自动策略',
    '新国自动策略',
    '台湾自动策略',
    '香港自动策略',
    '美国自动策略',
    '其他自动策略'
  ]);

  raw = clone(raw).filter(p =>
    p &&
    typeof p.name === 'string' &&
    p.name.trim() &&
    !info.test(p.name) &&
    ![
      'direct',
      'reject',
      'block',
      'selector',
      'urltest'
    ].includes(p.type)
  );

  // 不擅自修改链式节点引用。
  if (
    raw.some(
      p => p['dialer-proxy'] || p['underlying-proxy']
    )
  ) {
    throw new Error(
      '此版本不处理链式节点，请先在来源中移除链式节点'
    );
  }

  // 处理重名及保留名称冲突。
  for (const p of raw) {

    const base = p.name
      .replace(/[\r\n,=]/g, ' ')
      .trim();

    let name = base;
    let n = 2;

    while (reserved.has(name)) {
      name = `${base} (${n++})`;
    }

    reserved.add(name);
    p.name = name;
  }

  if (!raw.length) {
    throw new Error(
      '没有有效节点，停止生成，避免空组直连'
    );
  }

  // =========================
  // 4. 地区节点识别
  // =========================

  const regions = [
    [
      '日本自动策略',
      /(?:^|[^A-Za-z])(?:JP|JPN)\d*(?:$|[^A-Za-z])|日本|Japan|东京|東京|大阪|埼玉|🇯🇵/i
    ],
    [
      '新国自动策略',
      /(?:^|[^A-Za-z])(?:SG|SGP)\d*(?:$|[^A-Za-z])|新加坡|Singapore|狮城|獅城|🇸🇬/i
    ],
    [
      '台湾自动策略',
      /(?:^|[^A-Za-z])(?:TW|TWN)\d*(?:$|[^A-Za-z])|台湾|臺灣|Taiwan|🇹🇼/i
    ],
    [
      '香港自动策略',
      /(?:^|[^A-Za-z])(?:HK|HKG)\d*(?:$|[^A-Za-z])|香港|Hong[\s_-]*Kong|🇭🇰/i
    ],
    [
      '美国自动策略',
      /(?:^|[^A-Za-z])(?:US|USA)\d*(?:$|[^A-Za-z])|美国|美國|United[\s_-]*States|洛杉矶|洛杉磯|西雅图|西雅圖|🇺🇸/i
    ],
    [
      '其他自动策略',
      /.*/
    ]
  ];

  const groupsFor = names =>
    regions
      .map(([name, re], i) => ({
        name,
        members: names.filter(
          n =>
            regions.findIndex(
              ([, r]) => r.test(n)
            ) === i
        )
      }))
      .filter(g => g.members.length);

  const hierarchy = names => {

    const rg = groupsFor(names);

    const an = rg
      .filter(g =>
        regions
          .slice(0, 4)
          .some(([n]) => n === g.name)
      )
      .map(g => g.name);

    return { rg, an };
  };

  // =========================
  // 5. 测速地址
  // =========================

  const url =
    'https://cp.cloudflare.com/generate_204';

  // =========================
  // 6. 规则集基础地址
  // =========================

  const meta =
    'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo';

  const singRules =
    'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo';

  const ruleURL = (
    kind,
    name,
    ext,
    base = meta
  ) =>
    `${base}/${kind}/${encodeURIComponent(name)}.${ext}`;

  // =========================
  // 7. 业务规则
  // =========================

  const business = [
    'github',
    'apple',
    'onedrive',
    'microsoft',
    'openai',
    'telegram',
    'youtube',
    'netflix',
    'spotify',
    'tiktok',
    'google',
    'steam'
  ];

  const sets = [
    ['private', 'geosite', 'private', 'DIRECT'],
    ['geoip_private', 'geoip', 'private', 'DIRECT'],

    ['ads', 'geosite', 'category-ads-all', 'REJECT'],

    ['steam_cn', 'geosite', 'steam@cn', 'DIRECT'],
    ['games_cn', 'geosite', 'category-games@cn', 'DIRECT'],

    ...business.map(n => [
      n,
      'geosite',
      n,
      main
    ]),

    ['cn', 'geosite', 'cn', 'DIRECT'],
    ['geoip_cn', 'geoip', 'cn', 'DIRECT'],

    [
      'geolocation_non_cn',
      'geosite',
      'geolocation-!cn',
      main
    ]
  ];

  // =========================
  // 8. 特殊直连规则
  // =========================

  const directDomains = [
    'yuchsh.top'
  ];

  const directExact = [
    'clash.razord.top',
    'yacd.haishan.me'
  ];

  const steamDomains = [
    'steamcontent.com',
    'steamserver.net',
    'steamchina.com'
  ];

  // =========================
  // 9. 规则优先级
  // =========================

  const rulePlan = [

    // 特殊域名直连。
    ...directDomains.map(v => ({
      kind: 'suffix',
      value: v,
      target: 'DIRECT'
    })),

    ...directExact.map(v => ({
      kind: 'domain',
      value: v,
      target: 'DIRECT'
    })),

    // 私有网络及广告规则。
    ...sets.slice(0, 3).map(s => ({
      set: s
    })),

    // Steam 资源直连。
    ...steamDomains.map(v => ({
      kind: 'suffix',
      value: v,
      target: 'DIRECT'
    })),

    // 游戏、业务、国内、海外规则。
    ...sets.slice(3).map(s => ({
      set: s
    }))
  ];

  // =========================
  // 10. 转换 sing-box 节点
  // =========================

  const nodes = JSON.parse(
    ProxyUtils.produce(
      clone(raw),
      'sing-box'
    )
  );

  const out = nodes.outbounds || [];
  const endpoints = nodes.endpoints || [];

  const sourceNames = new Set(
    raw.map(p => p.name)
  );

  const names = [
    ...out,
    ...endpoints
  ]
    .filter(p => sourceNames.has(p.tag))
    .map(p => p.tag);

  if (!names.length) {
    throw new Error(
      '目标客户端没有支持的节点，停止生成'
    );
  }

  // =========================
  // 11. 构建自动策略组
  // =========================

  const { rg, an } = hierarchy(names);

  const auto = (tag, members) => ({
    type: 'urltest',
    tag,
    outbounds: members,
    url,
    interval: '5m',
    tolerance: 100,
    interrupt_exist_connections: false
  });

  // 亚洲包含日本、新加坡、台湾、香港。
  const asian = rg
    .filter(g => an.includes(g.name))
    .flatMap(g => g.members);

  // 亚洲和全球自动策略直接测试节点，
  // 不嵌套其他 urltest 策略组。
  const groups = [

    // 主节点选择。
    {
      type: 'selector',
      tag: main,
      outbounds: [
        global,
        ...(asian.length ? [asia] : []),
        ...rg.map(g => g.name),
        manual
      ],
      default: global
    },

    // 手动选择。
    {
      type: 'selector',
      tag: manual,
      outbounds: [
        global,
        ...names,
        'DIRECT'
      ],
      default: global
    },

    // 全球自动测速。
    auto(global, names),

    // 亚洲自动测速。
    ...(asian.length
      ? [auto(asia, asian)]
      : []),

    // 各地区自动测速。
    ...rg.map(g =>
      auto(g.name, g.members)
    )
  ];

  // =========================
  // 12. 构建路由规则
  // =========================

  const action = target =>
    target === 'REJECT'
      ? {
          action: 'reject'
        }
      : {
          action: 'route',
          outbound: target
        };

  const rules = rulePlan.map(r => {

    if (r.set) {
      return {
        rule_set: [r.set[0]],
        ...action(r.set[3])
      };
    }

    return {
      [
        r.kind === 'suffix'
          ? 'domain_suffix'
          : 'domain'
      ]: [r.value],

      ...action(r.target)
    };

  });

  // =========================
  // 13. 完整 sing-box 配置
  // =========================

  const config = {

    // -------------------------
    // 日志
    // -------------------------

    log: {
      level: 'debug',
      timestamp: true
    },

    // -------------------------
    // HTTP Client（1.14+）
    // -------------------------

    http_clients: [
      {
        tag: 'rules-http',
        detour: main
      }
    ],

    // -------------------------
    // DNS
    // -------------------------

    dns: {

      servers: [

        // 国内 DNS。
        {
          type: 'udp',
          tag: 'local-dns',
          server: '223.5.5.5'
        },

        // 国外加密 DNS，走代理。
        {
          type: 'https',
          tag: 'remote-dns',
          server: '1.1.1.1',
          path: '/dns-query',
          detour: main
        }
      ],

      // 国内域名使用本地 DNS。
      rules: [
        {
          rule_set: [
            'private',
            'cn'
          ],
          action: 'route',
          server: 'local-dns'
        }
      ],

      final: 'remote-dns',

      strategy: 'prefer_ipv4'
    },

    // -------------------------
    // Android TUN / VPN
    // -------------------------

    inbounds: [

      {
        type: 'tun',
        tag: 'tun-in',

        address: [
          '172.19.0.1/30'
        ],

        auto_route: true,

        dns_mode: 'hijack'
      },

      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: 7890
      }
    ],

    // -------------------------
    // 出站及策略组
    // -------------------------

    outbounds: [

      ...groups,

      ...out,

      {
        type: 'direct',
        tag: 'DIRECT'
      }
    ],

    // -------------------------
    // 路由
    // -------------------------

    route: {

      auto_detect_interface: true,

      default_domain_resolver: 'local-dns',

      // 远程规则集下载客户端。
      default_http_client: 'rules-http',

      rules: [

        // 自动识别流量协议。
        {
          action: 'sniff'
        },

        // DNS 劫持。
        {
          protocol: 'dns',
          action: 'hijack-dns'
        },

        // 自定义分流规则。
        ...rules
      ],

      // 未匹配规则走主策略。
      final: main,

      // -----------------------
      // 远程 SRS 规则集
      // -----------------------

      rule_set: sets.map(
        ([tag, kind, name]) => ({

          type: 'remote',

          tag,

          format: 'binary',

          url: ruleURL(
            kind,
            name,
            'srs',
            singRules
          ),

          // 1.14+ 新版 HTTP Client。
          http_client: 'rules-http',

          update_interval: '1d'

        })
      )
    },

    // -------------------------
    // 缓存
    // -------------------------

    experimental: {

      cache_file: {
        enabled: true
      }

    }
  };

  // =========================
  // 14. 保留端点
  // =========================

  if (endpoints.length) {
    config.endpoints = endpoints;
  }

  // =========================
  // 15. Debug 诊断模式
  // =========================

  if (String(args.debug) === 'true') {

    warn('Debug 模式已启用');

    // 简化 DNS，排除 DoH 问题。
    config.dns = {

      servers: [
        {
          type: 'udp',
          tag: 'local-dns',
          server: '223.5.5.5'
        }
      ],

      final: 'local-dns',

      strategy: 'prefer_ipv4'
    };

    // 关闭规则分流，仅保留 DNS 劫持。
    config.route.rules = [
      {
        action: 'sniff'
      },
      {
        protocol: 'dns',
        action: 'hijack-dns'
      }
    ];

    // 禁用远程规则集。
    config.route.rule_set = [];

    // 直接使用第一个节点测试。
    config.route.final = names[0];
  }

  // =========================
  // 16. 输出配置
  // =========================

  warn(
    `有效节点数量：${names.length}`
  );

  warn(
    `地区策略组数量：${rg.length}`
  );

  warn(
    `远程规则集数量：${config.route.rule_set.length}`
  );

  warn(
    'Android TUN 已默认启用'
  );

  input.$content = encode(config);

  return input;

}
