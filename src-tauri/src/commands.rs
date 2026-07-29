use deltachat::config::Config;
use deltachat::login_param::{EnteredCertificateChecks, EnteredLoginParam};
use deltachat::provider::Socket;
use tauri::State;

use crate::dto::{AdvancedLogin, ProfileDto};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

fn parse_socket(s: &Option<String>) -> Socket {
    match s.as_deref() {
        Some("ssl") => Socket::Ssl,
        Some("tls") => Socket::Starttls,
        Some("plain") => Socket::Plain,
        _ => Socket::Automatic,
    }
}

#[tauri::command]
pub async fn is_configured(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(state.current_id.lock().unwrap().is_some())
}

#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    email: String,
    password: String,
    advanced: Option<AdvancedLogin>,
) -> AppResult<u32> {
    let id = {
        let mut accounts = state.accounts.lock().await;
        accounts.add_account().await?
    };
    let ctx = {
        let accounts = state.accounts.lock().await;
        accounts
            .get_account(id)
            .ok_or_else(|| AppError::Core("account gone".into()))?
    };

    let mut param = EnteredLoginParam::default();
    param.addr = email.clone();
    param.imap.password = password.clone();
    if let Some(a) = &advanced {
        param.imap.server = a.imap_host.clone().unwrap_or_default();
        param.imap.port = a.imap_port.unwrap_or(0);
        param.imap.security = parse_socket(&a.imap_security);
        param.imap.user = a.imap_user.clone().unwrap_or_default();
        param.smtp.server = a.smtp_host.clone().unwrap_or_default();
        param.smtp.port = a.smtp_port.unwrap_or(0);
        param.smtp.security = parse_socket(&a.smtp_security);
        param.smtp.user = a.smtp_user.clone().unwrap_or_default();
        param.smtp.password = a.smtp_password.clone().unwrap_or_default();
        param.certificate_checks = EnteredCertificateChecks::Automatic;
    }

    ctx.add_or_update_transport(&mut param).await?;
    ctx.start_io().await;

    {
        let mut accounts = state.accounts.lock().await;
        accounts.select_account(id).await?;
    }

    // `set_current` 是同步 `&self`（Task 2 实现），无需 await、无需 mut。
    state.set_current(id);
    Ok(id)
}

#[tauri::command]
pub async fn get_self_profile(state: State<'_, AppState>) -> AppResult<ProfileDto> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let id = ctx.get_id();
    let name = ctx.get_config(Config::Displayname).await?;
    let addr = ctx.get_config(Config::ConfiguredAddr).await?;
    Ok(ProfileDto { id, name, addr })
}
