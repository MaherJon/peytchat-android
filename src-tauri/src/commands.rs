use deltachat::chat::{self, Chat, ChatItem};
use deltachat::chatlist::Chatlist;
use deltachat::config::Config;
use deltachat::constants::Chattype;
use deltachat::contact::Contact;
use deltachat::login_param::{EnteredCertificateChecks, EnteredLoginParam};
use deltachat::message::{self, MessageState};
use deltachat::provider::Socket;
use tauri::State;

use crate::dto::{AdvancedLogin, ChatDto, MsgDto, ProfileDto};
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

fn state_str(s: MessageState) -> &'static str {
    match s {
        MessageState::OutPending => "pending",
        MessageState::OutFailed => "failed",
        MessageState::OutDelivered => "delivered",
        MessageState::OutMdnRcvd => "read",
        _ => "other",
    }
}

#[tauri::command]
pub async fn get_chatlist(state: State<'_, AppState>) -> AppResult<Vec<ChatDto>> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let list = Chatlist::try_load(&ctx, 0, None, None).await?;
    let mut out = Vec::with_capacity(list.len());
    for i in 0..list.len() {
        let chat_id = list.get_chat_id(i)?;
        let chat = Chat::load_from_db(&ctx, chat_id).await?;
        let is_group = chat.get_type() == Chattype::Group;
        let (last_msg, last_ts) = if let Some(msg_id) = list.get_msg_id(i)? {
            let m = message::Message::load_from_db(&ctx, msg_id).await?;
            (Some(m.get_text()), Some(m.get_timestamp()))
        } else {
            (None, None)
        };
        let unread = chat_id.get_fresh_msg_cnt(&ctx).await? as u32;
        out.push(ChatDto {
            chat_id: chat_id.to_u32(),
            name: chat.get_name().to_string(),
            is_group,
            last_msg,
            last_ts,
            unread,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_chat_msgs(state: State<'_, AppState>, chat_id: u32) -> AppResult<Vec<MsgDto>> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let items = chat::get_chat_msgs(&ctx, chat_id).await?;
    let mut out = Vec::new();
    for item in items {
        if let ChatItem::Message { msg_id } = item {
            let m = message::Message::load_from_db(&ctx, msg_id).await?;
            let from_id = m.get_from_id();
            let from_name = if from_id == deltachat::contact::ContactId::SELF {
                "我".to_string()
            } else {
                Contact::get_by_id(&ctx, from_id)
                    .await?
                    .get_display_name()
                    .to_string()
            };
            out.push(MsgDto {
                msg_id: msg_id.to_u32(),
                from_id: from_id.to_u32(),
                from_name,
                text: m.get_text(),
                ts: m.get_timestamp(),
                is_out: m.get_state().is_outgoing(),
                state: state_str(m.get_state()).to_string(),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn send_text(
    state: State<'_, AppState>,
    chat_id: u32,
    text: String,
) -> AppResult<u32> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let msg_id = chat::send_text_msg(&ctx, chat_id, text).await?;
    Ok(msg_id.to_u32())
}
