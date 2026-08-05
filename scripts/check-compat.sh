#!/usr/bin/env bash
# =============================================================================
# check-compat.sh — UI 适配层完整性检查 + 上游同步
#
# 每次上游(桌面端)变更后运行此脚本,快速定位需要更新的位置。
#
# 用法:
#   ./scripts/check-compat.sh            # 完整检查
#   ./scripts/check-compat.sh --sync     # 拉取上游 + 比对桌面变更 + 完整检查
#   ./scripts/check-compat.sh --quick    # 仅 tsc + 导入检查(快)
#   ./scripts/check-compat.sh --pages    # 仅检查 pages/chat 适配器对齐
# =============================================================================

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARN=$((WARN + 1)); }
info() { echo -e "${YELLOW}→${NC} $1"; }
header() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

# ── 上游配置 ───────────────────────────────────────────────────────────────

UPSTREAM_REMOTE="upstream"
UPSTREAM_BRANCH="main"

# compat/ui/ 关心的桌面文件范围（相对于仓库根目录）
WATCHED_PATHS=(
  "src/pages/"
  "src/chat/chatView.ts"
  "src/chat/composer.ts"
  "src/chat/message.ts"
  "src/shell/shell.ts"
  "src/shell/rail.ts"
  "src/shell/navPanel.ts"
  "src/shell/rightDrawer.ts"
  "src/components/dropdown.ts"
  "src/components/icon.ts"
  "src/theme.ts"
  "src/types.ts"
)

# 桌面文件 → 适配器文件 映射
declare -A FILE_IMPACT_MAP=(
  ["src/pages/"]="src/compat/ui/pages.ts"
  ["src/chat/chatView.ts"]="src/compat/ui/chat.ts"
  ["src/chat/composer.ts"]="src/compat/ui/composer.ts"
  ["src/shell/shell.ts"]="src/compat/ui/shell.ts"
  ["src/theme.ts"]="src/compat/ui/styles.ts"
  ["src/components/icon.ts"]="src/compat/ui/shell.ts src/compat/ui/composer.ts src/compat/ui/navigation.ts"
  ["src/types.ts"]="src/compat/ui/pages.ts src/compat/ui/chat.ts src/compat/ui/composer.ts"
)

# ── 上游同步 ────────────────────────────────────────────────────────────────

check_upstream() {
  header "上游同步检查"

  # 检查 upstream 远程是否存在
  if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
    warn "未配置 upstream 远程,跳过同步检查"
    info "添加方法: git remote add upstream <上游仓库URL>"
    return
  fi

  local upstream_url
  upstream_url=$(git remote get-url "$UPSTREAM_REMOTE")
  pass "upstream 远程已配置: $upstream_url"

  # Fetch upstream
  info "正在拉取 upstream/${UPSTREAM_BRANCH}..."
  if ! git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --quiet 2>&1; then
    # 尝试 master 分支
    if ! git fetch "$UPSTREAM_REMOTE" master --quiet 2>&1; then
      fail "无法从 upstream 拉取,请检查网络或远程配置"
      return
    fi
    UPSTREAM_BRANCH="master"
  fi

  local upstream_ref="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
  pass "已拉取 upstream/${UPSTREAM_BRANCH}"

  # 比较当前分支与 upstream 的差异
  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD)

  info "比较 ${current_branch} ← ${upstream_ref} 的桌面文件变更..."

  local changed_files
  changed_files=$(git diff --name-only "${upstream_ref}"...HEAD -- "${WATCHED_PATHS[@]}" 2>/dev/null || true)

  if [[ -z "$changed_files" ]]; then
    pass "当前分支相对 upstream 无桌面 UI 文件变更"
    return
  fi

  # 有变更,分析影响范围
  echo ""
  echo -e "  ${YELLOW}▸ upstream 桌面文件有变更:${NC}"
  echo ""

  local impacted_adapters=()
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    local status
    status=$(git diff --name-status "${upstream_ref}"...HEAD -- "$file" 2>/dev/null | awk '{print $1}')

    echo -e "    ${status:0:1}  ${file}"

    # 查找受影响的适配器
    for pattern in "${!FILE_IMPACT_MAP[@]}"; do
      if [[ "$file" == $pattern ]] || [[ "$file" == $pattern* ]]; then
        local adapters="${FILE_IMPACT_MAP[$pattern]}"
        for ad in $adapters; do
          if [[ ! " ${impacted_adapters[*]} " =~ " ${ad} " ]]; then
            impacted_adapters+=("$ad")
          fi
        done
      fi
    done
  done <<< "$changed_files"

  echo ""

  if [[ ${#impacted_adapters[@]} -gt 0 ]]; then
    warn "以下适配器文件可能需要更新:"
    for ad in "${impacted_adapters[@]}"; do
      echo -e "    └─ ${RED}${ad}${NC}"
    done
    echo ""
    info "建议: 检查上游变更内容,同步更新适配器,然后运行 ./scripts/check-compat.sh 验证"
  fi
}

# ── 检查项 1: TypeScript 编译 ──────────────────────────────────────────────

check_typescript() {
  info "TypeScript 类型检查..."
  if npx tsc --noEmit 2>&1; then
    pass "tsc --noEmit 通过"
  else
    fail "tsc --noEmit 有错误,请修复后再继续"
    return 1
  fi
}

# ── 检查项 2: 旧 compat 导入残留 ───────────────────────────────────────────

check_stale_imports() {
  info "检查旧 compat 层导入残留..."
  local stale
  stale=$(grep -rn "compat/adapters\|compat/mappers\|compat/services\|compat/presenters\|compat/events\|compat/navigation\|compat/state\|compat/bridge" \
    src/mobile/ src/compat/ui/ src/shell/ src/main.ts 2>/dev/null || true)

  if [[ -z "$stale" ]]; then
    pass "无旧 compat 层导入残留"
  else
    fail "发现旧 compat 层导入残留:"
    echo "$stale" | while read -r line; do
      echo "    $line"
    done
  fi
}

# ── 检查项 3: mobile/ 直接导入 api.ts 和 state.ts ──────────────────────────

check_direct_imports() {
  info "检查 mobile/ 是否直接使用 api.ts 和 state.ts..."

  if grep -q "from.*'../../api.js'" src/mobile/app/main.ts; then
    pass "mobile/app/main.ts 直接导入 api.ts"
  else
    fail "mobile/app/main.ts 未直接导入 api.ts"
  fi

  if grep -q "from.*'../../state.js'" src/mobile/app/main.ts; then
    pass "mobile/app/main.ts 直接导入 state.ts"
  else
    fail "mobile/app/main.ts 未直接导入 state.ts"
  fi
}

# ── 检查项 4: mobile/ 不直接导入桌面 pages/chat/ ──────────────────────────

check_no_direct_desktop_ui() {
  info "检查 mobile/ 是否绕过 compat/ui/ 直接导入桌面 UI..."

  local direct
  direct=$(grep -rn "from.*'../../pages/\|from.*'../../chat/chatView\|from.*'../../chat/composer\|from.*'../../shell/shell" \
    src/mobile/ 2>/dev/null || true)

  if [[ -z "$direct" ]]; then
    pass "mobile/ 未绕过 compat/ui/ 直接导入桌面 UI"
  else
    warn "mobile/ 存在直接导入桌面 UI(应改为通过 compat/ui/):"
    echo "$direct" | while read -r line; do
      echo "    $line"
    done
  fi
}

# ── 检查项 5: pages 适配器与桌面导出对齐 ──────────────────────────────────

check_pages_adapter() {
  info "检查 compat/ui/pages.ts 与桌面 pages/* 导出对齐..."

  local mappings=(
    "renderMessagesPage:../../pages/messagesPage.js"
    "renderContactsPage:../../pages/contactsPage.js"
    "renderGroupsPage:../../pages/groupsPage.js"
    "renderWorkPage:../../pages/workPage.js"
    "renderMePage:../../pages/settingsPage.js"
    "renderInboxMain:../../pages/inboxPage.js"
    "renderTerminalPage:../../pages/terminalPage.js"
  )

  local errors=0
  for entry in "${mappings[@]}"; do
    local fn="${entry%%:*}"
    local mod="${entry##*:}"
    local rel="${mod#../../}"
    local abs="src/${rel}"
    abs="${abs%.js}.ts"

    if [[ ! -f "$abs" ]]; then
      fail "pages 适配器: $mod → 模块文件不存在!"
      errors=$((errors + 1))
      continue
    fi

    if grep -q "export.*function $fn\b" "$abs" 2>/dev/null; then
      pass "pages: $fn ← $(basename "$abs")"
    else
      fail "pages: $fn 在 $(basename "$abs") 中未找到! 可能需要更新 pages.ts"
      errors=$((errors + 1))
    fi
  done
}

# ── 检查项 6: chat 适配器与 chatView 导出对齐 ─────────────────────────────

check_chat_adapter() {
  info "检查 compat/ui/chat.ts 与 chat/chatView.ts 导出对齐..."

  local adapter_refs
  adapter_refs=$(grep -oP "renderChatView|appendOptimisticMessage|appendNewMessages" src/compat/ui/chat.ts | sort -u)

  for fn in $adapter_refs; do
    if grep -q "export.*function $fn\|export.*async function $fn" src/chat/chatView.ts 2>/dev/null; then
      pass "chat 适配器引用 $fn → chatView.ts 存在"
    else
      fail "chat 适配器引用 $fn → chatView.ts 中未找到!"
    fi
  done
}

# ── 检查项 7: compat/ui/ 文件完整性 ────────────────────────────────────────

check_adapter_files() {
  info "检查 compat/ui/ 文件完整性..."

  local required=(
    "src/compat/ui/index.ts"
    "src/compat/ui/shell.ts"
    "src/compat/ui/chat.ts"
    "src/compat/ui/pages.ts"
    "src/compat/ui/composer.ts"
    "src/compat/ui/navigation.ts"
    "src/compat/ui/styles.ts"
  )

  for f in "${required[@]}"; do
    if [[ -f "$f" ]]; then
      pass "$f 存在"
    else
      fail "$f 缺失!"
    fi
  done
}

# ── 检查项 8: compat/ 目录清洁度 ──────────────────────────────────────────

check_compat_clean() {
  info "检查 compat/ 目录清洁度..."

  local extra
  extra=$(find src/compat -type f ! -path 'src/compat/ui/*' 2>/dev/null || true)

  if [[ -z "$extra" ]]; then
    pass "compat/ 仅包含 ui/ 子目录"
  else
    fail "compat/ 存在预期的 ui/ 之外的文件:"
    echo "$extra" | while read -r line; do
      echo "    $line"
    done
  fi
}

# ── 主流程 ─────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║       UI 适配层完整性检查                                  ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""

  local mode="${1:-full}"

  case "$mode" in
    --sync)
      check_upstream
      echo ""
      # 上游检查后自动执行完整检查
      check_typescript || true
      check_adapter_files
      check_compat_clean
      check_stale_imports
      check_direct_imports
      check_no_direct_desktop_ui
      check_pages_adapter
      check_chat_adapter
      ;;
    --quick)
      check_typescript || true
      check_stale_imports
      ;;
    --pages)
      check_pages_adapter
      check_chat_adapter
      ;;
    *)
      check_typescript || true
      check_adapter_files
      check_compat_clean
      check_stale_imports
      check_direct_imports
      check_no_direct_desktop_ui
      check_pages_adapter
      check_chat_adapter
      ;;
  esac

  echo ""
  echo "──────────────────────────────────────────────────────────"
  echo -e "  结果: ${GREEN}${PASS} 通过${NC}, ${RED}${FAIL} 失败${NC}"
  if [[ $WARN -gt 0 ]]; then
    echo -e "         ${YELLOW}${WARN} 警告${NC}"
  fi
  echo "──────────────────────────────────────────────────────────"
  echo ""

  if [[ $FAIL -gt 0 ]]; then
    echo "修复指南:"
    echo "  • 桌面页面导出变了 → 更新 src/compat/ui/pages.ts"
    echo "  • 桌面 chatView 导出变了 → 更新 src/compat/ui/chat.ts"
    echo "  • 旧 compat 残留导入 → 改为从 compat/ui/ 或 api.ts/state.ts 导入"
    echo "  • 文件缺失 → 检查是否被误删"
    echo ""
    exit 1
  fi
}

main "$@"
