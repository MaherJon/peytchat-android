# Android 构建指南

![Platform](https://img.shields.io/badge/Platform-Android-9ED446?style=flat-square&logo=android)
![Language](https://img.shields.io/badge/Language-Ts-blue)
![Language](https://img.shields.io/badge/Language-Rust-blue)


本项目为[PleaseEnterYourTextCommunity](https://github.com/NoWint/PleaseEnterYourTextCommunity)的android移植

---

## 📦 环境要求

本项目涉及android交叉编译，为了您有良好的开发体验，我们建议您在**linux**上进行开发

### 1. 系统依赖（Linux）

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y \
    pkg-config \
    libglib2.0-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libsoup2.4-dev \
    libjavascriptcoregtk-4.1-dev \
    libxdo-dev \
    libssl-dev \
    build-essential \
    curl \
    wget \
    file \
    librsvg2-dev \
    libayatana-appindicator3-dev
```
## 2. Rust 环境

```bash
# 安装 Rust（如果未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 添加 Android 编译目标
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add x86_64-linux-android
rustup target add i686-linux-android
```
## 3. Android SDK & NDK

### 安装 Android Studio

从 Android Studio 官网 下载

或通过 Snap 安装：sudo snap install android-studio --classic

### 配置 SDK/NDK 路径

```bash
# 在 ~/.bashrc 中添加
export ANDROID_HOME=~/Android/Sdk
export NDK_HOME=$ANDROID_HOME/ndk/30.0.15729638
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin
source ~/.bashrc
```
### 通过 Android Studio 安装组件

SDK Platforms：Android API 33+

SDK Tools：NDK (Side by side)、CMake

### 4. Node.js 环境

```bash
#使用 NVM 安装（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm alias default 20
nvm use 20

# 验证
node --version  # 应 >= v18
npm --version   # 应 >= v8
```

## 🚀 构建步骤

### 1. 初始化子模块

```bash
git submodule update --init --recursive
```

### 2. 安装依赖

```bash
# 前端依赖
npm install

# Rust 依赖（会自动处理）
cd src-tauri
cargo build
cd ..
```

### 3. 生成 Android 项目

```bash
# 首次构建或项目结构变更时需要
npx tauri android init

# 将configfile下的xml文件复制到gen/android/app/src下
```

### 4. 构建前端
```bash
npm run build
# 生成 dist/ 目录，包含所有静态资源
```

### 5. 构建 APK
```bash
# 构建通用 APK（包含所有架构）
npx tauri android build
```
### 6. 签名apk
```bash
# 创建 keystore
keytool -genkey -v -keystore peytchat.keystore -alias peytchat -keyalg RSA -keysize 2048 -validity 10000

# 按提示输入：
# - 密码（记住！）
# - 姓名
# - 组织单位
# - 组织名称
# - 城市
# - 省份
# - 国家代码（CN）

# 签名
apksigner sign \
    --ks peytchat.keystore \
    --ks-pass pass:你的密码 \
    --ks-key-alias peytchat \
    --key-pass pass:你的密码 \
    src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk

```

## 📱 调试与安装
连接 Android 设备
开启开发者模式

设置 → 关于手机 → 连续点击版本号 7 次

返回设置 → 系统 → 开发者选项

开启 USB 调试

验证连接

```bash
adb devices
# 应显示设备序列号
```
## 安装 APK

```bash
# 直接安装
adb install src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk

# 如果已安装旧版本，强制覆盖
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```
## 开发模式（热更新）
```bash
# 启动开发服务器并在设备上运行
cargo tauri android dev
```
## 调试
前端调试：Chrome 浏览器打开 chrome://inspect，选择应用页面点击 inspect

Rust 日志：adb logcat | grep -i rust

## 📂 输出文件位置
| 类型 | 路径 |
| ---- | ---- |
| 通用 APK | src-tauri/gen/android/app/build/outputs/apk/universal/release/ |
| 分架构 APK | src-tauri/gen/android/app/build/outputs/apk/release/ |
| AAB（Google Play）| src-tauri/gen/android/app/build/outputs/bundle/release/ |

## 🔧 常见问题
### 1. ring 编译失败 / 找不到 NDK 编译器
症状：

```text
error: failed to run custom build command for `ring`
ToolNotFound: failed to find tool "aarch64-linux-android-clang"
```
解决方案：

```bash
# 确保 NDK_HOME 环境变量已设置
export NDK_HOME=~/Android/Sdk/ndk/30.0.15729638

# 验证编译器是否存在
ls $NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android*-clang
```
### 2. 内存不足 (SIGKILL)
症状：

```text
signal: 9, SIGKILL: kill
```
解决方案：

```bash
# 使用单线程编译
CARGO_BUILD_JOBS=1 cargo build

# 或增加 Swap 空间
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
### 3. Node.js 版本过低
症状：

```text
SyntaxError: Unexpected reserved word
```
解决方案：

```bash
# 升级到 Node.js 20+
nvm install 20
nvm use 20
```
### 4. 权限错误
症状：

```text
Permission core:network:default not found
```
解决方案：
检查 src-tauri/capabilities/mobile-capabilities.json，移除 core:network:default，改为：

```json
{
  "identifier": "mobile-capabilities",
  "platforms": ["android", "iOS"],
  "permissions": ["core:default", "core:path:default"]
}
```
### 5. 无法生成 APK
症状：

```text
Failed to assemble APK
```
解决方案：

```bash
# 清理并重新生成
rm -rf src-tauri/gen/android
cargo tauri android init
npm run build
cargo tauri android build --apk
```

## 📝 注意事项
src-tauri/gen/ 目录由 Tauri 自动生成，请勿手动提交到 Git

Android 签名：生产发布需要配置 Keystore，参考 Tauri 官方文档

API 级别：当前 minSdk = 24（Android 7.0），targetSdk = 33（Android 13）

包名：com.peytchat.app，在 tauri.conf.json 中配置

## 🔗 参考链接
[Tauri Android 指南](https://tauri.app/distribute/sign/android/)

[Delta Chat Core](https://github.com/deltachat)

[Android NDK 文档](https://developer.android.google.cn/ndk)