use deltachat::chat::{self, Chat, ChatItem};
use deltachat::chatlist::Chatlist;
use deltachat::config::Config;
use deltachat::constants::Chattype;
use deltachat::contact::{Contact, ContactId};
use deltachat::login_param::{EnteredCertificateChecks, EnteredLoginParam};
use deltachat::message::{self, MessageState};
use deltachat::provider::Socket;
use deltachat::securejoin;
use tauri::State;

use crate::dto::{
    AdvancedLogin, ChannelDto, ChatDto, ChatInfoDto, ContactDto, MemberDto, MsgDto, ProfileDto,
    WorkspaceDto,
};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Debug log to project dir (stderr is swallowed by macOS GUI).
fn dbg(msg: impl AsRef<str>) {
    use std::io::Write;
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../debug.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "{}", msg.as_ref());
        let _ = f.flush();
    }
}

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

    if let Err(e) = ctx.add_or_update_transport(&mut param).await {
        let msg = e.to_string().to_lowercase();
        let mapped = if msg.contains("auth") || msg.contains("login") || msg.contains("password") {
            AppError::AuthFailed
        } else if msg.contains("network") || msg.contains("connection") || msg.contains("timeout") {
            AppError::Network(msg)
        } else if msg.contains("autoconfig") || msg.contains("provider") {
            AppError::AutoconfigNotFound
        } else {
            AppError::Core(e.to_string())
        };
        return Err(mapped);
    }
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
pub async fn create_chatmail_account(
    state: State<'_, AppState>,
    display_name: String,
) -> AppResult<u32> {
    dbg(format!("[chatmail] start, display_name={display_name}"));
    let id = {
        let mut accounts = state.accounts.lock().await;
        accounts.add_account().await?
    };
    dbg(format!("[chatmail] add_account ok, id={id}"));
    let ctx = {
        let accounts = state.accounts.lock().await;
        accounts
            .get_account(id)
            .ok_or_else(|| AppError::Core("account gone".into()))?
    };
    dbg("[chatmail] got context, calling add_transport_from_qr...");

    ctx.add_transport_from_qr("dcaccount:nine.testrun.org")
        .await
        .map_err(|e| {
            dbg(format!("[chatmail] add_transport_from_qr FAILED: {e}"));
            let msg = e.to_string().to_lowercase();
            if msg.contains("network") || msg.contains("connection") || msg.contains("timeout") {
                AppError::Network(msg)
            } else {
                AppError::Core(e.to_string())
            }
        })?;
    dbg("[chatmail] add_transport_from_qr ok, setting display name...");

    ctx.set_config(Config::Displayname, Some(&display_name))
        .await?;
    dbg("[chatmail] display name set, selecting account...");

    {
        let mut accounts = state.accounts.lock().await;
        accounts.select_account(id).await?;
    }
    state.set_current(id);
    dbg(format!("[chatmail] done, id={id}"));
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
        let is_contact_request = chat.is_contact_request();
        let is_self_talk = chat.is_self_talk();
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
            is_contact_request,
            is_self_talk,
            last_msg,
            last_ts,
            unread,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_chat_info(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<ChatInfoDto> {
    let ctx = state
        .current()
        .await
        .ok_or_else(|| AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let chat = Chat::load_from_db(&ctx, chat_id).await?;
    let is_group = chat.get_type() == Chattype::Group;
    let is_contact_request = chat.is_contact_request();
    let is_self_talk = chat.is_self_talk();

    let mut members = Vec::new();
    for cid in chat::get_chat_contacts(&ctx, chat_id).await? {
        let c = Contact::get_by_id(&ctx, cid).await?;
        members.push(MemberDto {
            contact_id: cid.to_u32(),
            name: c.get_display_name().to_string(),
            addr: c.get_addr().to_string(),
            is_self: cid == ContactId::SELF,
        });
    }
    // For 1:1 chats, get_chat_contacts does NOT include SELF; add the other
    // side's info is already there, but if list is empty (self-talk), we still
    // want to show self.
    if members.is_empty() && is_self_talk {
        let self_id = ctx.get_id();
        let name = ctx.get_config(Config::Displayname).await?.unwrap_or_default();
        let addr = ctx.get_config(Config::ConfiguredAddr).await?.unwrap_or_default();
        members.push(MemberDto {
            contact_id: 1, // SELF is always 1
            name,
            addr,
            is_self: true,
        });
        let _ = self_id; // suppress unused warning
    }

    Ok(ChatInfoDto {
        chat_id: chat_id.to_u32(),
        name: chat.get_name().to_string(),
        is_group,
        is_contact_request,
        is_self_talk,
        members,
    })
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

#[tauri::command]
pub async fn get_contacts(state: State<'_, AppState>) -> AppResult<Vec<ContactDto>> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let ids = Contact::get_all(&ctx, 0, None).await?;
    let mut out = Vec::new();
    for id in ids {
        if id == ContactId::SELF || id == ContactId::INFO || id == ContactId::DEVICE {
            continue;
        }
        let c = Contact::get_by_id(&ctx, id).await?;
        out.push(ContactDto {
            id: id.to_u32(),
            name: c.get_display_name().to_string(),
            addr: c.get_addr().to_string(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn create_group(
    state: State<'_, AppState>,
    name: String,
    member_emails: Vec<String>,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = chat::create_group(&ctx, &name).await?;
    for email in member_emails {
        let email = email.trim();
        if email.is_empty() {
            continue;
        }
        let cid = Contact::create(&ctx, "", email).await?;
        chat::add_contact_to_chat(&ctx, chat_id, cid).await?;
    }
    Ok(chat_id.to_u32())
}

#[tauri::command]
pub async fn add_group_member(
    state: State<'_, AppState>,
    chat_id: u32,
    email: String,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let cid = Contact::create(&ctx, "", &email).await?;
    chat::add_contact_to_chat(&ctx, chat_id, cid).await?;
    Ok(cid.to_u32())
}

/// Create a 1:1 chat with the given email. If a chat already exists
/// (including a contact-request chat), returns the existing chat id.
#[tauri::command]
pub async fn create_chat_by_email(
    state: State<'_, AppState>,
    email: String,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let email = email.trim().to_string();
    if email.is_empty() {
        return Err(AppError::Core("邮箱不能为空".into()));
    }
    let cid = Contact::create(&ctx, "", &email).await?;
    let chat_id = deltachat::chat::ChatId::create_for_contact(&ctx, cid).await?;
    Ok(chat_id.to_u32())
}

/// Accept a contact-request chat so the user can reply.
#[tauri::command]
pub async fn accept_chat(state: State<'_, AppState>, chat_id: u32) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    chat_id.accept(&ctx).await?;
    Ok(())
}

/// Block a contact-request chat (and its contact).
#[tauri::command]
pub async fn block_chat(state: State<'_, AppState>, chat_id: u32) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    chat_id.block(&ctx).await?;
    Ok(())
}

/// Delete a chat (also used to dismiss a contact request).
#[tauri::command]
pub async fn delete_chat(state: State<'_, AppState>, chat_id: u32) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    chat_id.delete(&ctx).await?;
    Ok(())
}

/// Leave a group chat (removes SELF from the member list).
#[tauri::command]
pub async fn leave_group(state: State<'_, AppState>, chat_id: u32) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    chat::remove_contact_from_chat(&ctx, chat_id, ContactId::SELF).await?;
    Ok(())
}

/// Mark all messages in a chat as noticed (clears unread badge).
#[tauri::command]
pub async fn mark_chat_noticed(state: State<'_, AppState>, chat_id: u32) -> AppResult<()> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    chat::marknoticed_chat(&ctx, chat_id).await?;
    Ok(())
}

/// Returns the user's own SecureJoin QR code (e.g. `OPENPGP4FPR:...`)
/// that another Delta Chat user can scan to add you as a verified contact.
/// Pass `chat_id = None` for the personal QR, or a group chat id for a group-invite QR.
#[tauri::command]
pub async fn get_securejoin_qr(
    state: State<'_, AppState>,
    chat_id: Option<u32>,
) -> AppResult<String> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = chat_id.map(deltachat::chat::ChatId::new);
    let qr = securejoin::get_securejoin_qr(&ctx, chat_id).await?;
    Ok(qr)
}

/// Perform a SecureJoin by scanning a `dccontact:` / `dcgroup:` / `DCACCOUNT:` URL.
/// Returns the resulting chat id (for `dccontact:` it's the 1:1 chat with the new verified contact).
#[tauri::command]
pub async fn secure_join(state: State<'_, AppState>, qr: String) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = securejoin::join_securejoin(&ctx, &qr).await?;
    Ok(chat_id.to_u32())
}

#[tauri::command]
pub async fn list_workspaces(state: State<'_, AppState>) -> AppResult<Vec<WorkspaceDto>> {
    Ok(state.db.list_workspaces().await?)
}

#[tauri::command]
pub async fn create_workspace(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<WorkspaceDto> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    // 创建总群
    let master_chat_id = chat::create_group(&ctx, &name).await?;
    let master_u32 = master_chat_id.to_u32();
    // 写本地表
    let icon = name.chars().next().map(|c| c.to_uppercase().to_string());
    let id = state.db.insert_workspace(&name, master_u32, icon.as_deref()).await?;
    // 默认频道：general + announcements
    for ch_name in ["general", "announcements"] {
        let ch_id = chat::create_group(&ctx, ch_name).await?;
        state.db.insert_channel(id, ch_id.to_u32(), ch_name, "General", 0).await?;
    }
    // 默认 core role
    let _ = state.db.insert_role(id, "core", None).await?;
    // 返回完整 DTO
    let ws = state.db.find_workspace_by_master_chat(master_u32).await?
        .ok_or(AppError::Core("workspace not found after insert".into()))?;
    Ok(ws)
}

#[tauri::command]
pub async fn join_workspace(
    state: State<'_, AppState>,
    qr: String,
) -> AppResult<WorkspaceDto> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = securejoin::join_securejoin(&ctx, &qr).await?;
    let master_u32 = chat_id.to_u32();
    // 检查是否已存在
    if let Some(existing) = state.db.find_workspace_by_master_chat(master_u32).await? {
        return Ok(existing);
    }
    // 从总群 chat 获取名字
    let chat = Chat::load_from_db(&ctx, chat_id).await?;
    let name = chat.get_name().to_string();
    let icon = name.chars().next().map(|c| c.to_uppercase().to_string());
    let id = state.db.insert_workspace(&name, master_u32, icon.as_deref()).await?;
    let ws = state.db.find_workspace_by_master_chat(master_u32).await?
        .ok_or(AppError::Core("workspace not found after insert".into()))?;
    Ok(ws)
}

#[tauri::command]
pub async fn list_channels(
    state: State<'_, AppState>,
    workspace_id: i64,
) -> AppResult<Vec<ChannelDto>> {
    Ok(state.db.list_channels(workspace_id).await?)
}

#[tauri::command]
pub async fn create_channel(
    state: State<'_, AppState>,
    workspace_id: i64,
    name: String,
    category: String,
) -> AppResult<ChannelDto> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = chat::create_group(&ctx, &name).await?;
    state.db.insert_channel(workspace_id, chat_id.to_u32(), &name, &category, 0).await?;
    // 返回该频道 DTO（按 chat_id 查找）
    let chans = state.db.list_channels(workspace_id).await?;
    chans.into_iter().find(|c| c.chat_id == chat_id.to_u32())
        .ok_or(AppError::Core("channel not found after insert".into()))
}
