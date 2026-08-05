#!/bin/bash

set -e

echo "🔍 Checking Android build..."

# 检查 Rust
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust not installed"
    exit 1
fi

# 检查 Android target
if ! rustup target list | grep -q "aarch64-linux-android (installed)"; then
    echo "📦 Installing Android target..."
    rustup target add aarch64-linux-android
fi

# 检查 NDK
if [ ! -d "$ANDROID_HOME/ndk" ]; then
    echo "❌ Android NDK not found"
    echo "Install via: sdkmanager ndk-bundle"
    exit 1
fi

# 检查前端
echo "📦 Installing frontend dependencies..."
npm ci

echo "🔨 Building frontend..."
npm run build

echo "🔨 Building Android..."
cd src-tauri
cargo check --target aarch64-linux-android

echo "✅ Android check passed!"