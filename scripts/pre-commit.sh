#!/usr/bin/env sh
# 阶段 0 本地 Git 提交前钩子（可选，不强行安装）
#
# 作用：提交前依次跑 typecheck 与 test，任一失败即阻断提交。
#
# 挂载方式（任选其一，无需 husky）：
#   1) 直接复制为钩子：
#        cp scripts/pre-commit.sh .git/hooks/pre-commit
#        chmod +x .git/hooks/pre-commit
#   2) 或在仓库根目录执行一次：
#        git config core.hooksPath scripts
#      （把 scripts/ 作为 hooks 目录，本文件名需为 pre-commit）
#
# 注意：本脚本不修改 package.json 的 prepare 钩子，也未引入 husky/lint-staged 依赖。

set -e

echo "[pre-commit] 运行 typecheck ..."
yarn typecheck

echo "[pre-commit] 运行 unit tests ..."
yarn test

echo "[pre-commit] 全部通过，允许提交。"
