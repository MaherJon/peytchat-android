#!/bin/bash

# PEYT Chat Android 调试脚本
# 用法: ./debug-app.sh [命令]
# 命令: log | install | start | stop | restart | monitor | crash | network | clear | help

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PACKAGE="com.peytchat.app"
ACTIVITY=".MainActivity"
APK_PATH="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
KEYSTORE="peytchat.keystore"
KEY_ALIAS="peytchat"
KEY_PASS="xxxxxxxx"  # 替换为实际密码

# 颜色输出函数
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查设备连接
check_device() {
    if ! adb devices | grep -q "device$"; then
        print_error "No Android device connected!"
        print_info "Please connect a device and enable USB debugging"
        exit 1
    fi
    print_success "Device connected"
}

# 获取应用 PID
get_pid() {
    adb shell ps | grep "$PACKAGE" | awk '{print $2}'
}

# 获取应用 UID
get_uid() {
    adb shell dumpsys package $PACKAGE | grep "userId=" | head -1 | sed 's/.*userId=//' | sed 's/ .*//'
}

# 显示应用信息
show_app_info() {
    print_info "=== App Info ==="
    PID=$(get_pid)
    if [ -n "$PID" ]; then
        echo "  PID: $PID"
        echo "  UID: $(get_uid)"
    else
        echo "  Status: Not running"
    fi
    echo "  Package: $PACKAGE"
    echo "  APK: $APK_PATH"
}

# 安装应用
install_app() {
    check_device
    print_info "Installing $PACKAGE..."
    
    # 检查 APK 是否存在
    if [ ! -f "$APK_PATH" ]; then
        print_error "APK not found: $APK_PATH"
        print_info "Build first: ./debug-app.sh build"
        exit 1
    fi
    
    # 尝试签名
    if [ -f "$KEYSTORE" ]; then
        print_info "Signing APK..."
        apksigner sign \
            --ks "$KEYSTORE" \
            --ks-pass "pass:$KEY_PASS" \
            --ks-key-alias "$KEY_ALIAS" \
            --key-pass "pass:$KEY_PASS" \
            "$APK_PATH" 2>/dev/null || print_warning "Signing failed, installing unsigned"
    else
        print_warning "Keystore not found, installing unsigned APK"
    fi
    
    # 安装
    adb install -r "$APK_PATH"
    
    if [ $? -eq 0 ]; then
        print_success "Installation successful"
    else
        print_error "Installation failed"
        print_info "Trying to uninstall and reinstall..."
        adb uninstall $PACKAGE 2>/dev/null
        adb install "$APK_PATH"
    fi
}

# 启动应用
start_app() {
    check_device
    print_info "Starting $PACKAGE..."
    adb shell am start -n "$PACKAGE/$ACTIVITY"
    if [ $? -eq 0 ]; then
        print_success "App started"
    else
        print_error "Failed to start app"
    fi
}

# 停止应用
stop_app() {
    check_device
    print_info "Stopping $PACKAGE..."
    adb shell am force-stop $PACKAGE
    print_success "App stopped"
}

# 重启应用
restart_app() {
    stop_app
    sleep 1
    start_app
}

# 查看日志
view_logs() {
    check_device
    PID=$(get_pid)
    
    print_info "=== App Logs ==="
    if [ -n "$PID" ]; then
        print_info "Filtering by PID: $PID"
        FILTER="$PID|$PACKAGE|RustStdoutStderr|deltachat"
    else
        FILTER="$PACKAGE|RustStdoutStderr|deltachat"
    fi
    
    adb logcat -v time | grep -E "$FILTER" --color=always
}

# 查看崩溃日志
view_crash_logs() {
    check_device
    print_info "=== Crash Logs ==="
    
    echo "--- Recent Crashes ---"
    adb logcat -d -b crash | grep -A 20 -B 5 "$PACKAGE" | tail -50
    
    echo ""
    echo "--- Tombstones ---"
    adb shell "ls -la /data/tombstones/ 2>/dev/null | tail -5"
    
    echo ""
    echo "--- ANR ---"
    adb logcat -d -b events | grep -E "am_anr|$PACKAGE" | tail -10
}

# 查看网络日志
view_network_logs() {
    check_device
    PID=$(get_pid)
    print_info "=== Network Logs ==="
    
    if [ -n "$PID" ]; then
        FILTER="$PID|$PACKAGE"
    else
        FILTER="$PACKAGE"
    fi
    
    adb logcat -v time | grep -E "$FILTER" | grep -E "http|fetch|socket|connect|imap|smtp|network|request|response" --color=always
}

# 清理日志
clear_logs() {
    check_device
    print_info "Clearing logs..."
    adb logcat -c
    print_success "Logs cleared"
}

# 截图
screenshot() {
    check_device
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    FILENAME="screenshot_${TIMESTAMP}.png"
    print_info "Taking screenshot..."
    adb shell screencap /sdcard/screen.png
    adb pull /sdcard/screen.png "$FILENAME" 2>/dev/null
    if [ -f "$FILENAME" ]; then
        print_success "Screenshot saved: $FILENAME"
    else
        print_error "Failed to take screenshot"
    fi
}

# 查看应用状态
show_status() {
    check_device
    print_info "=== App Status ==="
    
    PID=$(get_pid)
    if [ -n "$PID" ]; then
        echo "✅ App is running (PID: $PID)"
        
        echo ""
        print_info "Memory Usage:"
        adb shell dumpsys meminfo $PACKAGE | grep -E "TOTAL|Native|Dalvik|Pss" | head -5
        
        echo ""
        print_info "CPU Usage:"
        adb shell top -n 1 -b | grep "$PID" | head -2
        
        echo ""
        print_info "Current Activity:"
        adb shell dumpsys activity activities | grep -A 3 "mResumedActivity.*$PACKAGE" | head -3
    else
        echo "❌ App is not running"
    fi
    
    echo ""
    echo "Package Info:"
    adb shell dumpsys package $PACKAGE | grep -E "versionName|versionCode|enabled|stopped" | head -5
}

# 构建 APK
build_app() {
    cd /home/maherjon/peytchat-android
    print_info "Building frontend..."
    npm run build || {
        print_error "Frontend build failed"
        exit 1
    }
    
    print_info "Building Android APK..."
    npx tauri android build || {
        print_error "Android build failed"
        exit 1
    }
    
    if [ -f "$APK_PATH" ]; then
        print_success "APK built: $APK_PATH"
    else
        print_error "APK not found"
        exit 1
    fi
}

# 全量测试
full_test() {
    print_info "=== Full Test ==="
    build_app
    install_app
    restart_app
    sleep 3
    show_status
    print_info "Press Ctrl+C to stop logs"
    sleep 2
    view_logs
}

# 显示帮助
show_help() {
    cat << EOF
PEYT Chat Android 调试脚本

用法: ./debug-app.sh [命令]

命令:
  install   - 安装 APK
  start     - 启动应用
  stop      - 停止应用
  restart   - 重启应用
  log       - 实时查看日志 (默认)
  network   - 查看网络日志
  crash     - 查看崩溃日志
  clear     - 清除日志
  status    - 查看应用状态
  screenshot - 截图
  build     - 重新构建 APK
  full      - 全量测试 (构建 + 安装 + 启动 + 日志)
  help      - 显示帮助

示例:
  ./debug-app.sh install
  ./debug-app.sh log
  ./debug-app.sh full

EOF
}

# 主逻辑
case "${1:-log}" in
    install)
        install_app
        ;;
    start)
        start_app
        ;;
    stop)
        stop_app
        ;;
    restart)
        restart_app
        ;;
    log)
        view_logs
        ;;
    network)
        view_network_logs
        ;;
    crash)
        view_crash_logs
        ;;
    clear)
        clear_logs
        ;;
    status)
        show_status
        ;;
    screenshot)
        screenshot
        ;;
    build)
        build_app
        ;;
    full)
        full_test
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_warning "未知命令: $1，使用 'help' 查看帮助"
        show_help
        ;;
esac