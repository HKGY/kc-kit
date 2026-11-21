#!/usr/bin/env bash
# kc-kit 安装脚本: 拉模拟内核(固定版本) + 游戏主数据 + fleethub 计算核
# 需要: git, node >= 19 (自带 npm)
set -euo pipefail
cd "$(dirname "$0")"
REPLAY_SHA=be9fb1173ab75241fd956902e74ac821108a7e3f   # KC3Kai/kancolle-replay 2026-10-30, 已验证可无头加载

node -e 'if (+process.versions.node.split(".")[0] < 19) { console.error("需要 node >= 19, 当前 " + process.version); process.exit(1); }'

if [ ! -d kancolle-replay/js ]; then
  echo "== 拉 kancolle-replay (只取 js/ 与 reader/, 约 10MB)"
  rm -rf kancolle-replay && mkdir kancolle-replay && cd kancolle-replay
  git init -q && git remote add origin https://github.com/KC3Kai/kancolle-replay
  git sparse-checkout set js reader
  git fetch -q --depth 1 --filter=blob:none origin "$REPLAY_SHA"
  git checkout -q FETCH_HEAD
  cd ..
fi

mkdir -p data
echo "== 下载 api_start2 (Tibowl 镜像)"
curl -fsSL https://raw.githubusercontent.com/Tibowl/api_start2/master/start2.json -o data/api_start2.json

echo "== 安装 fleethub-core"
[ -f package.json ] || npm init -y >/dev/null
npm i --silent fleethub-core equipment-bonus
node lib/fh.js update

echo "== 自检 (虚拟舰队跑 5-1, 约 10 秒)"
node examples/5-1-mikawa.js --virtual --sims 300
echo
echo "安装完成。下一步: node lib/fetch-stock.mjs <你的kc-web库存短链ID> accounts/me/stock-$(date +%F).json"
