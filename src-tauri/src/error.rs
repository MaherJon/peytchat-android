use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("认证失败：邮箱或密码错误")]
    AuthFailed,
    #[error("网络错误：{0}")]
    Network(String),
    #[error("未找到自动配置，请手动填写 IMAP/SMTP")]
    AutoconfigNotFound,
    #[error("核心错误：{0}")]
    Core(String),
    #[error("IO 错误：{0}")]
    Io(String),
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Core(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
