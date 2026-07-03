# Clash-scripts

适用于 Mihomo / FlClash 的覆写脚本。

## 推荐版本

使用 [`覆写脚本v6`](./覆写脚本v6)。

v6 主要改进：

- GitHub 与 GHCR 使用 GitHub 专用地址进行节点健康检查，自动避开仅能访问测速地址、却无法连接 GitHub 的节点。
- 测速超时由 3 秒提高到 8 秒，降低跨境网络抖动造成的误判。
- 通用出口与 GitHub、Steam、AI 等业务策略解耦，避免策略组互相污染。
- 保留订阅或其它覆写脚本中已有的规则提供器。
- Steam 国内下载与国内 CDN 直连，Steam 商店、社区和海外服务走代理。

## 使用

将 `覆写脚本v6` 的完整内容复制到 FlClash 的 JavaScript 覆写中并启用。更新脚本后，建议在 FlClash 中重新应用配置一次，使旧策略选择缓存失效。

脚本不会主动修改 DNS 或 TUN 设置，这两项继续由 FlClash 管理。
