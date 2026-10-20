# Clash-scripts

个人自用的代理配置脚本合集，主要包括：

- **Mihomo（Clash Meta）覆写脚本**：适用于 FlClash、Clash Verge Rev、Clash Party 等客户端。
- **Sub-Store 配置生成脚本**：把同一份订阅转换成 sing-box / Stash / Surfboard / Xray 可直接使用的完整配置。

> 推荐使用 **[覆写脚本v10.js](./覆写脚本v10.js)**。

---

## 目录

- [v10 覆写脚本](#v10-覆写脚本)
  - [策略组结构](#策略组结构)
  - [分流组与默认出口](#分流组与默认出口)
  - [规则顺序](#规则顺序)
  - [使用方法](#使用方法)
  - [自定义](#自定义)
- [Sub-Store 配置生成脚本](#sub-store-配置生成脚本)
- [文件说明](#文件说明)
- [版本历史](#版本历史)

---

## v10 覆写脚本

v10 的结构参考了 [iKeLee](https://t.me/iKeLee) 的 Loon 自动配置。它解决了 v9 及之前版本的一个问题：所有分流规则都只能走同一个「🚀 节点选择」。在 v10 中，**每类服务都有自己的策略组**，可以单独指定出口。比如 AI 走美国，TikTok 走新加坡，其他流量仍然自动选择。

### 策略组结构

```
节点
 ├─ 按地区归类（香港 / 台湾 / 日本 / 韩国 / 新加坡 / 美国 / 其他）
 │    ├─ XX自动   url-test   地区内自动选延迟最低的节点（tolerance 50ms，避免频繁切换）
 │    └─ XX手动   select     地区内手动指定节点
 ├─ 🎮 游戏手动   select     节点名含「游戏 / 🎮 / GAME」的节点（订阅里没有这类节点时不生成）
 └─ 🧭 手动选择   select     全部节点 + DIRECT

♻️ 兜底自动    fallback   按 香港 → 台湾 → 日本 → 韩国 → 新加坡 → 美国 → 其他 的顺序故障转移
🚀 节点选择    select     总出口，默认选「♻️ 兜底自动」；不含 DIRECT，自动策略失效时也不会退回直连

🤖 AI / 📲 Telegram / 📹 YouTube / …   select   每类服务一个，可在面板里单独切换
🐟 漏网之鱼    select     兜底规则（MATCH）使用的组
```

- 订阅里没有节点的地区不会生成对应的组，引用它的地方也会自动跳过，不会报错。
- 节点名包含「剩余流量 / 到期 / 官网 / 套餐」等字样的订阅信息条目会被过滤掉。
- 面板里手动切换过的选择会被记住（`store-selected`），更新订阅后不会被重置。

### 分流组与默认出口

| 分流组 | 规则集 | 默认出口 | 可选直连 |
|---|---|---|:---:|
| 🤖 AI | `category-ai-!cn`、`openai` | 美国手动（没有美国节点时用 🚀 节点选择） | |
| 📲 Telegram | `telegram`（域名 + IP） | ♻️ 兜底自动 | |
| 📹 YouTube | `youtube` | 🚀 节点选择 | |
| 🎥 Netflix | `netflix` | 🚀 节点选择 | |
| 🎵 Spotify | `spotify` | 🚀 节点选择 | |
| 🎶 TikTok | `tiktok` | 新加坡手动 | |
| 🔍 Google | `google` | 🚀 节点选择 | |
| 🐱 GitHub | `github` | 🚀 节点选择 | |
| 🍎 Apple | `apple` | 🚀 节点选择 | ✓ |
| Ⓜ️ 微软 | `microsoft`、`onedrive` | 🚀 节点选择 | ✓ |
| 🎮 Steam | `steam` | 🚀 节点选择 | ✓ |
| 🐟 漏网之鱼 | `geolocation-!cn` + `MATCH` | 🚀 节点选择 | ✓ |

每个分流组的可选项依次为：默认出口 → 🚀 节点选择 → ♻️ 兜底自动 → 各地区自动 → 各地区手动 → 🧭 手动选择 →（DIRECT）。

规则集来自 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)，使用 `.mrs` 格式，每天更新一次，下载时走直连。

### 规则顺序

1. 面板域名、自有域名 → 直连
2. 局域网 / 私有地址 → 直连
3. 广告（`category-ads-all`）→ 拒绝
4. Steam 国内下载 CDN、国内游戏 → 直连
5. 各服务分流组（见上表）
6. 国内域名、国内 IP → 直连
7. 其余流量 → 🐟 漏网之鱼

### 使用方法

**FlClash**：工具 → 覆写 → 脚本，新建脚本后粘贴 [覆写脚本v10.js](./覆写脚本v10.js) 的完整内容，然后在订阅的覆写设置里启用它。

**Clash Verge Rev / Clash Party**：在订阅的「扩展脚本」中粘贴完整内容并保存。

从旧版本升级时，建议重新应用一次配置，或者在面板里检查各分流组的选择，以清掉旧策略组留下的缓存。

脚本不会修改 DNS 和 TUN 设置，这两项仍由客户端管理。

### 自定义

增删服务只需要改脚本里的 `SERVICES` 表。例如新增 Disney+：

```js
// 1. 在 SERVICES 表中加一行
{ name: "🏰 Disney+", sets: ["disney"], prefer: ["新加坡自动"] },

// 2. 在 rule-providers 中加入对应规则集
disney: geosite("disney"),
```

其他常用参数：

| 想要修改的内容 | 对应位置 |
|---|---|
| 地区识别关键词、地区顺序（也就是兜底顺序） | `REGIONS` |
| 测速地址、间隔、超时、容差 | `TEST_URL` / `TEST_INTERVAL` / `TEST_TIMEOUT` / `TEST_TOLERANCE` |
| 需要过滤掉的订阅信息关键词 | `EXCLUDE_NODE_REGEX` |
| 直连的自有域名 | `config.rules` 开头几行 |

---

## Sub-Store 配置生成脚本

这些脚本**不在客户端里运行**，而是在 [Sub-Store](https://github.com/sub-store-org/Sub-Store) 中运行，用于生成完整的配置文件。

**使用位置**：Sub-Store → 文件 → 新建普通文件 → 文件操作 → 脚本操作，填入脚本链接，并在末尾加上参数：

```
#type=collection&name=你的组合订阅名称
```

如果不传 `name`，脚本会直接解析文件内容里的节点订阅或 Mihomo 配置。sing-box 脚本额外支持 `&debug=true` 调试模式。

| 脚本 | 目标客户端 | 说明 |
|---|---|---|
| [singbox.js](./singbox.js) | sing-box（Android 1.14+） | 完整配置，默认开启 TUN；包含地区自动测速、手动选择、广告拦截、国内直连和业务分流 |
| [stash.js](./stash.js) | Stash | 地区 fallback 分组，全球 / 亚洲兜底 |
| [surfboard.js](./surfboard.js) | Surfboard | 同上，规则在生成时固化进配置 |
| [xray.js](./xray.js) | Xray | 使用 leastLoad 负载均衡；观测未就绪或节点全部失效时拒绝连接，不会退回直连 |

> 这几个脚本目前仍是 v9 的分组思路（所有业务走同一个出口），还没有改成 v10 的独立分流组结构。

---

## 文件说明

| 文件 | 说明 |
|---|---|
| `覆写脚本v10.js` | **推荐**。Mihomo 覆写脚本，每类服务独立分流 |
| `覆写脚本v9.js` | 地区组使用 fallback，所有业务走 🚀 节点选择 |
| `覆写脚本v9 loadbalance版.js` | v9 的变体：地区组使用 load-balance + sticky-sessions |
| `覆写脚本v8.js` | GitHub 使用专用测速地址；亚洲组按 日本 → 新加坡 → 台湾 → 香港 降级 |
| `覆写脚本v2` ~ `v7` | 历史版本，仅作存档 |
| `全局拓展脚本-自动切换.txt` | 早期的全局扩展脚本，按关键词生成 Google / Telegram / Apple / 流媒体分组，使用 Loyalsoldier 规则集 |
| `singbox.js` / `stash.js` / `surfboard.js` / `xray.js` | Sub-Store 配置生成脚本，见上文 |

---

## 版本历史

- **v10**
  - 每类服务有独立的 select 分流组，可以单独指定出口。
  - 新增韩国地区。
  - 地区组拆成「自动（url-test）」和「手动（select）」两个组。
  - 新增 ♻️ 兜底自动（fallback）。
  - AI 规则集补充了 `category-ai-!cn`，Telegram 补充了 IP 规则。
  - 新增可选的游戏节点分组。
- **v9**：地区组改为 fallback，加快故障切换（1 次失败即切换）；移除 🚀 节点选择中的 DIRECT。另有 load-balance 版本。
- **v8**：
  - GitHub 使用专用健康检查地址。
  - 亚洲组按地区优先级降级。
  - 校验测速返回的状态码。
  - 自动去重节点和策略引用。
  - 保留订阅中已有的规则提供器。
- **v2 ~ v7**：早期迭代版本。

## 致谢

- [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)：规则集
- [iKeLee](https://t.me/iKeLee)：Loon 自动配置的分组思路
- [Sub-Store](https://github.com/sub-store-org/Sub-Store)
