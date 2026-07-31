use std::io::Read;
use std::path::PathBuf;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

use crate::error::{AppError, AppResult};

/// A plugin entry from the GitHub registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryPlugin {
    pub name: String,
    pub version: String,
    pub title: String,
    pub description: String,
    pub author: String,
    #[serde(rename = "type")]
    pub plugin_type: String, // "theme" | "chatbot" | "llm" | "general"
    pub entry: String,       // e.g. "plugin.js"
}

/// Top-level registry JSON fetched from the unified GitHub repo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub repo: String,
    pub plugins: Vec<RegistryPlugin>,
}

/// Status of an installed plugin, mirrored to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct PluginStatus {
    pub name: String,
    pub title: String,
    pub description: String,
    pub plugin_type: String,
    pub version: String,
    pub author: String,
    pub enabled: bool,
}

/// Manages plugin install / list / toggle / uninstall on disk.
pub struct PluginManager {
    base_dir: PathBuf,
    registry_url: String,
    raw_base: String,
}

impl PluginManager {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            base_dir: app_data_dir.join("plugins"),
            registry_url:
                "https://raw.githubusercontent.com/peytchat/plugins/main/registry.json".into(),
            raw_base: "https://raw.githubusercontent.com/peytchat/plugins/main/plugins".into(),
        }
    }

    /// Fetch the plugin registry from GitHub and cache it locally.
    pub async fn fetch_registry(&self) -> AppResult<Vec<RegistryPlugin>> {
        let resp = reqwest::get(&self.registry_url)
            .await
            .map_err(|e| AppError::Plugin(format!("获取插件列表失败: {e}")))?;
        let registry: Registry = resp
            .json()
            .await
            .map_err(|e| AppError::Plugin(format!("解析插件列表失败: {e}")))?;
        if let Ok(json) = serde_json::to_string(&registry) {
            let _ = tokio::fs::create_dir_all(&self.base_dir).await;
            let _ = tokio::fs::write(self.base_dir.join("registry_cache.json"), &json).await;
        }
        Ok(registry.plugins)
    }

    /// Install a plugin by name from the GitHub registry.
    pub async fn install_plugin(&self, name: &str) -> AppResult<RegistryPlugin> {
        let manifest_url = format!("{}/{}/plugin.json", self.raw_base, name);
        let resp = reqwest::get(&manifest_url)
            .await
            .map_err(|e| AppError::Plugin(format!("无法获取插件 {name}: {e}")))?;
        if !resp.status().is_success() {
            return Err(AppError::Plugin(format!("插件 {name} 不存在于仓库中")));
        }
        let plugin: RegistryPlugin = resp
            .json()
            .await
            .map_err(|e| AppError::Plugin(format!("解析插件 {name} 清单失败: {e}")))?;

        let dir = self.base_dir.join(name);
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        let entry_url = format!("{}/{}/{}", self.raw_base, name, plugin.entry);
        let js_resp = reqwest::get(&entry_url)
            .await
            .map_err(|e| AppError::Plugin(format!("无法下载插件脚本 {name}: {e}")))?;
        let js_bytes = js_resp
            .bytes()
            .await
            .map_err(|e| AppError::Plugin(format!("读取插件脚本 {name} 失败: {e}")))?;

        let manifest_json = serde_json::to_string_pretty(&plugin)
            .map_err(|e| AppError::Plugin(format!("序列化清单失败: {e}")))?;
        let mut f = tokio::fs::File::create(dir.join("plugin.json"))
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        f.write_all(manifest_json.as_bytes())
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        let mut f = tokio::fs::File::create(dir.join(&plugin.entry))
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        f.write_all(&js_bytes)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        // Default: enabled
        let _ = tokio::fs::write(dir.join("enabled"), b"1").await;
        Ok(plugin)
    }

    /// Install a plugin from a base64-encoded ZIP file picked locally.
    pub fn install_plugin_from_zip(&self, data_base64: &str) -> AppResult<RegistryPlugin> {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_base64)
            .map_err(|e| AppError::Plugin(format!("Base64 解码失败: {e}")))?;

        let reader = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(reader)
            .map_err(|e| AppError::Plugin(format!("ZIP 读取失败: {e}")))?;

        // Find plugin.json to determine the plugin name.
        let mut manifest_content = None;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| AppError::Plugin(e.to_string()))?;
            let name = file.name().to_string();
            if name.ends_with("plugin.json") {
                let mut content = String::new();
                file.read_to_string(&mut content).map_err(|e| AppError::Io(e.to_string()))?;
                manifest_content = Some(content);
                break;
            }
        }
        let manifest_str = manifest_content
            .ok_or_else(|| AppError::Plugin("ZIP 中缺少 plugin.json".into()))?;
        let plugin: RegistryPlugin = serde_json::from_str(&manifest_str)
            .map_err(|e| AppError::Plugin(format!("解析 plugin.json 失败: {e}")))?;

        let dst = self.base_dir.join(&plugin.name);
        if dst.exists() {
            std::fs::remove_dir_all(&dst).map_err(|e| AppError::Io(e.to_string()))?;
        }

        // Extract all files, stripping an optional top-level folder.
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| AppError::Plugin(e.to_string()))?;
            if file.is_dir() {
                continue;
            }
            let name = file.name().to_string();
            let rel_path = name.split('/').skip(1).collect::<Vec<_>>().join("/");
            if rel_path.is_empty() {
                continue;
            }
            let target = dst.join(&rel_path);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| AppError::Io(e.to_string()))?;
            }
            let mut content = Vec::new();
            file.read_to_end(&mut content).map_err(|e| AppError::Io(e.to_string()))?;
            std::fs::write(&target, &content).map_err(|e| AppError::Io(e.to_string()))?;
        }

        std::fs::write(dst.join("enabled"), b"1").map_err(|e| AppError::Io(e.to_string()))?;
        Ok(plugin)
    }

    /// Remove a plugin directory.
    pub fn uninstall_plugin(&self, name: &str) -> AppResult<()> {
        let dir = self.base_dir.join(name);
        if !dir.exists() {
            return Err(AppError::Plugin(format!("插件 {name} 未安装")));
        }
        std::fs::remove_dir_all(&dir).map_err(|e| AppError::Io(e.to_string()))?;
        Ok(())
    }

    /// List all installed plugins with their enabled status.
    pub fn list_plugins(&self) -> AppResult<Vec<PluginStatus>> {
        if !self.base_dir.exists() {
            return Ok(vec![]);
        }
        let mut plugins = vec![];
        for entry in std::fs::read_dir(&self.base_dir)
            .map_err(|e| AppError::Io(e.to_string()))?
        {
            let entry = entry.map_err(|e| AppError::Io(e.to_string()))?;
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let dir = entry.path();
            let manifest_path = dir.join("plugin.json");
            if !manifest_path.exists() {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&manifest_path) else {
                continue;
            };
            if let Ok(plugin) = serde_json::from_str::<RegistryPlugin>(&content) {
                plugins.push(PluginStatus {
                    enabled: dir.join("enabled").exists(),
                    name: plugin.name,
                    title: plugin.title,
                    description: plugin.description,
                    plugin_type: plugin.plugin_type,
                    version: plugin.version,
                    author: plugin.author,
                });
            }
        }
        Ok(plugins)
    }

    /// Read the JS entry content for a plugin (used by the frontend loader).
    pub fn get_plugin_js(&self, name: &str) -> AppResult<String> {
        let dir = self.base_dir.join(name);
        let manifest_path = dir.join("plugin.json");
        if !manifest_path.exists() {
            return Err(AppError::Plugin(format!("插件 {name} 未安装")));
        }
        let content = std::fs::read_to_string(&manifest_path)
            .map_err(|e| AppError::Io(e.to_string()))?;
        let manifest: RegistryPlugin = serde_json::from_str(&content)
            .map_err(|e| AppError::Plugin(format!("解析 {name} 清单失败: {e}")))?;
        std::fs::read_to_string(dir.join(&manifest.entry))
            .map_err(|e| AppError::Io(e.to_string()))
    }

    /// Enable or disable a plugin by creating/removing the "enabled" marker.
    pub fn toggle_plugin(&self, name: &str, enabled: bool) -> AppResult<()> {
        let dir = self.base_dir.join(name);
        if !dir.exists() {
            return Err(AppError::Plugin(format!("插件 {name} 未安装")));
        }
        let enabled_path = dir.join("enabled");
        if enabled {
            std::fs::write(&enabled_path, b"1").map_err(|e| AppError::Io(e.to_string()))?;
        } else {
            let _ = std::fs::remove_file(&enabled_path);
        }
        Ok(())
    }
}
