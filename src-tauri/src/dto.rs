use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct AdvancedLogin {
    pub imap_host: Option<String>,
    pub imap_port: Option<u16>,
    pub imap_security: Option<String>, // "ssl" | "tls" | "plain"
    pub imap_user: Option<String>,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    pub smtp_security: Option<String>,
    pub smtp_user: Option<String>,
    pub smtp_password: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProfileDto {
    pub id: u32,
    pub name: Option<String>,
    pub addr: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tauri v2 默认对命令参数名做 camelCase→snake_case 转换，
    /// 因此 DTO 字段使用 snake_case 命名。这里验证含 `imap_host` 等字段的
    /// JSON 能被正确反序列化为 `AdvancedLogin`。
    #[test]
    fn test_advanced_login_deserialize_snake_case() {
        let json = r#"{
            "imap_host": "imap.example.com",
            "imap_port": 993,
            "imap_security": "ssl",
            "imap_user": "alice",
            "smtp_host": "smtp.example.com",
            "smtp_port": 587,
            "smtp_security": "tls",
            "smtp_user": "alice",
            "smtp_password": "secret"
        }"#;
        let parsed: AdvancedLogin = serde_json::from_str(json).expect("deserialize AdvancedLogin");
        assert_eq!(parsed.imap_host.as_deref(), Some("imap.example.com"));
        assert_eq!(parsed.imap_port, Some(993));
        assert_eq!(parsed.imap_security.as_deref(), Some("ssl"));
        assert_eq!(parsed.imap_user.as_deref(), Some("alice"));
        assert_eq!(parsed.smtp_host.as_deref(), Some("smtp.example.com"));
        assert_eq!(parsed.smtp_port, Some(587));
        assert_eq!(parsed.smtp_security.as_deref(), Some("tls"));
        assert_eq!(parsed.smtp_user.as_deref(), Some("alice"));
        assert_eq!(parsed.smtp_password.as_deref(), Some("secret"));
    }
}
