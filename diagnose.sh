#!/bin/bash

echo "=== PEYT Chat Android Build Diagnosis ==="

cd /home/maherjon/peytchat-android

# 1. 检查 APK
echo ""
echo "1. Checking APK..."
if [ -f "src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk" ]; then
    echo "✅ APK exists"
    ls -lh src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
else
    echo "❌ APK not found"
fi

# 2. 检查 APK 内容
echo ""
echo "2. Checking APK contents..."
unzip -l src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk | head -20

# 3. 检查 native libraries
echo ""
echo "3. Checking native libraries..."
unzip -l src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk | grep "\.so"

# 4. 检查签名
echo ""
echo "4. Checking APK signature..."
apksigner verify src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk 2>&1

# 5. 检查设备信息
echo ""
echo "5. Device info..."
adb shell getprop ro.product.cpu.abi

# 6. 建议
echo ""
echo "=== Recommendations ==="
echo "1. Try: npm run tauri android dev"
echo "2. Try: cd src-tauri/gen/android && ./gradlew assembleDebug"
echo "3. Try: npm run tauri android build -- --target aarch64-linux-android"
