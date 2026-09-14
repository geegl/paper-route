#!/bin/bash
# 送报少年 —— 双击启动
cd "$(dirname "$0")"

PORT=8137

# 如果端口已被占用，直接打开浏览器
if lsof -ti :$PORT >/dev/null 2>&1; then
  open "http://localhost:$PORT/"
  exit 0
fi

nohup python3 -m http.server $PORT >/dev/null 2>&1 &
sleep 0.6
open "http://localhost:$PORT/"
echo "送报少年已启动：http://localhost:$PORT/（关闭本窗口不影响游戏）"
