# kc-kit

让 Claude Code 按你的真实库存给舰队Collection 配队、跑出击模拟、导出 deckbuilder 存档的最小工作台。

## 需要
- [Claude Code](https://claude.com/claude-code)
- git、Node.js 19 以上(macOS / Linux；Windows 用 WSL 或 Git Bash)

## 安装(约 1 分钟，下载 20MB 左右)
```bash
./setup.sh
```
它会拉模拟内核 kancolle-replay(固定版本，只取代码部分)、游戏主数据、fleethub 计算核，最后用一支虚拟舰队跑 5-1 自检。看到三行 S 率和"安装完成"就是好了。

## 导入你的库存
1. 打开 [kc-web 制空权模拟器](https://noro6.github.io/kc-web/)，把舰娘和装备数据读进去(支持从游戏辅助工具导入)。
2. 在舰娘/装备管理页点「共有」，得到形如 `https://kc.noro6.net/s/XXXX` 的短链。
3. 运行：
```bash
node lib/fetch-stock.mjs XXXX accounts/me/stock-2026-11-21.json
node lib/kit.js stock          # 确认读到了
```
注意分享只包含**已锁定**的舰。

## 开始用
在这个目录里启动 Claude Code，直接用中文提需求，例如：
- "我卡在任务 XXX 了，按我的库存给个编组，告诉我成功率"
- "5-4 刷战果，帮我比较这两套编成的 S 率和资源消耗"
- "把刚才的编组导出成 deckbuilder，我要贴进 airsim 看"

Claude 会读 `CLAUDE.md` 里的工作规则：查 wiki 确认任务条件和路线 → 读你的库存配装 → 跑几千次模拟 → 校验装备合法性 → 给结论。

`examples/5-1-mikawa.js` 是一个完整例子(任务 B41 新编三川舰队)，也可以让 Claude 照着它写新的。

## 注意
- 模拟结果是统计估计，不是保证；机制有争议的部分(如烟幕)用的是社区估测值。
- 带損管大破进击这类方案有沉船风险，操作前自己确认損管确实装在大破的船上。
- 数据来源和计算核都是第三方项目：[kancolle-replay](https://github.com/KC3Kai/kancolle-replay)、[kc-web](https://github.com/noro6/kc-web)、[fleethub](https://github.com/MadonoHaru/fleethub)、[api_start2 镜像](https://github.com/Tibowl/api_start2)、wikiwiki。请控制抓取频率。
- 这只是起点。用的过程中纠正 Claude 的错误，它会把教训记进自己的记忆，越用越准。

## 许可
本仓库自己的代码和文档以 [MIT](LICENSE) 许可发布。`setup.sh` 下载的第三方项目和数据不在此列，各自遵循其原许可。
