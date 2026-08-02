// Tauri Android 构建配置 - Linux 版

import java.io.File
import org.gradle.process.ExecResult

// ========== 路径配置 ==========
val projectRoot = rootProject.projectDir.parentFile.parentFile
val cargoToml = File(projectRoot, "Cargo.toml")

if (!cargoToml.exists()) {
    throw GradleException("Cargo.toml not found at ${cargoToml.absolutePath}")
}

println("📁 Project root: ${projectRoot.absolutePath}")
println("📄 Cargo.toml: ${cargoToml.absolutePath}")

// ========== NDK 配置 ==========
val ndkHome = System.getenv("NDK_HOME") ?: System.getenv("ANDROID_NDK_HOME")
val apiLevel = "24"

val ndkPath = if (!ndkHome.isNullOrEmpty()) {
    ndkHome
} else {
    "/home/maherjon/Android/Sdk/ndk/30.0.15729638"
}

val ndkToolchainPath = "$ndkPath/toolchains/llvm/prebuilt/linux-x86_64/bin"
val clangPath = "$ndkToolchainPath/aarch64-linux-android${apiLevel}-clang"
val arPath = "$ndkToolchainPath/llvm-ar"

println("🔧 NDK Path: $ndkPath")
println("🔧 Clang: $clangPath")

// ========== Rust 构建任务 ==========
tasks.register("buildRust") {
    group = "build"
    description = "Build Rust library for Android"

    doLast {
        val cargo = "cargo"
        val target = "aarch64-linux-android"
        
        val clangFile = File(clangPath)
        if (!clangFile.exists()) {
            println("⚠️ 警告: Clang 编译器不存在: $clangPath")
        }

        val result = project.exec {
            workingDir = projectRoot
            commandLine(cargo, "build", "--target", target, "--release")

            // ⭐ 关键修改：环境变量配置
            environment("CC_aarch64_linux_android", clangPath)
            environment("AR_aarch64_linux_android", arPath)
            environment("CC", clangPath)
            environment("AR", arPath)
            
            // ⭐ 移除 CFLAGS 中的 -target 参数，避免重复
            // 让 OpenSSL 通过 CC 自动检测目标平台
            environment("CFLAGS_aarch64_linux_android", "")
            environment("CFLAGS", "")
            
            environment("NDK_HOME", ndkPath)
            environment("ANDROID_NDK_HOME", ndkPath)
            environment("RUSTFLAGS", "")
            
            // ⭐ 使用系统 OpenSSL（如果可用）
            // 如果不想编译 OpenSSL 源码，取消注释下面这行
            environment("OPENSSL_NO_VENDOR", "1")
            
            val currentPath = System.getenv("PATH") ?: ""
            environment("PATH", "$ndkToolchainPath:$currentPath")
            
            isIgnoreExitValue = false
        }
        
        println("🔧 Build result: ${result.exitValue}")
        
        val sourceLib = File(projectRoot, "target/$target/release/libpeytchat.so")
        val destDir = File(rootProject.projectDir, "app/src/main/jniLibs/arm64-v8a")
        val destLib = File(destDir, "libpeytchat.so")
        
        if (sourceLib.exists()) {
            destDir.mkdirs()
            sourceLib.copyTo(destLib, overwrite = true)
            println("✅ Rust 库已复制到: ${destLib.absolutePath}")
        } else {
            println("⚠️ 警告: Rust 库未找到: ${sourceLib.absolutePath}")
        }
    }
}

afterEvaluate {
    tasks.named("preBuild") {
        dependsOn("buildRust")
    }
}
