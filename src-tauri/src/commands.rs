use deltachat::chat::{self, Chat, ChatItem};
use deltachat::chatlist::Chatlist;
use deltachat::config::Config;
use deltachat::constants::Chattype;
use deltachat::contact::{Contact, ContactId};
use deltachat::login_param::{EnteredCertificateChecks, EnteredLoginParam};
use deltachat::message::{self, Message, MessageState, MsgId};
use deltachat::provider::Socket;
use deltachat::reaction;
use deltachat::securejoin;
use tauri::State;

use crate::dto::{
    AdvancedLogin, ChannelDto, ChatDto, ChatInfoDto, ContactDto, ContactRoleDto, MemberDto, MsgDto,
    PinDto, ProfileDto, ReactionDto, RoleDto, WorkspaceDto,
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
            let (quote_from, quote_text) = match m.quoted_message(&ctx).await? {
                Some(q) => {
                    let q_from_id = q.get_from_id();
                    let q_name = if q_from_id == deltachat::contact::ContactId::SELF {
                        "我".to_string()
                    } else {
                        Contact::get_by_id(&ctx, q_from_id)
                            .await?
                            .get_display_name()
                            .to_string()
                    };
                    (Some(q_name), Some(q.get_text()))
                }
                None => (None, None),
            };
            out.push(MsgDto {
                msg_id: msg_id.to_u32(),
                from_id: from_id.to_u32(),
                from_name,
                text: m.get_text(),
                ts: m.get_timestamp(),
                is_out: m.get_state().is_outgoing(),
                state: state_str(m.get_state()).to_string(),
                quote_from,
                quote_text,
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
    let ctx = state
        .current()
        .await
        .ok_or(AppError::Core("no account".into()))?;
    let mut chans = state.db.list_channels(workspace_id).await?;
    for ch in &mut chans {
        let chat_id = deltachat::chat::ChatId::new(ch.chat_id);
        ch.unread = chat_id.get_fresh_msg_cnt(&ctx).await.unwrap_or(0) as u32;
    }
    Ok(chans)
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

// ── pin/role commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_channel_pins(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<Vec<PinDto>> {
    Ok(state.db.list_pins(chat_id).await?)
}

#[tauri::command]
pub async fn toggle_pin(
    state: State<'_, AppState>,
    workspace_id: i64,
    chat_id: u32,
    msg_id: u32,
) -> AppResult<bool> {
    // SELF contact_id 在 deltachat core 中固定为 1
    let pinned_by = 1;
    Ok(state.db.toggle_pin(workspace_id, chat_id, msg_id, pinned_by).await?)
}

#[tauri::command]
pub async fn list_roles(
    state: State<'_, AppState>,
    workspace_id: i64,
) -> AppResult<Vec<RoleDto>> {
    Ok(state.db.list_roles(workspace_id).await?)
}

#[tauri::command]
pub async fn set_contact_role(
    state: State<'_, AppState>,
    workspace_id: i64,
    contact_id: u32,
    role_id: i64,
) -> AppResult<()> {
    state.db.set_contact_role(workspace_id, contact_id, role_id).await?;
    Ok(())
}

/// Returns every (contact_id, role_id, role_name, role_color) tuple for a
/// workspace, serialized as a named DTO so the JS side gets field names
/// instead of a positional array.
#[tauri::command]
pub async fn list_all_contact_roles(
    state: State<'_, AppState>,
    workspace_id: i64,
) -> AppResult<Vec<ContactRoleDto>> {
    let rows = state.db.list_all_contact_roles(workspace_id).await?;
    Ok(rows
        .into_iter()
        .map(|(contact_id, role_id, role_name, role_color)| ContactRoleDto {
            contact_id,
            role_id,
            role_name,
            role_color,
        })
        .collect())
}

// ── reaction commands ───────────────────────────────────────────────────────
//
// Verified against `core/src/reaction.rs`:
//   pub async fn send_reaction(context, msg_id, reaction: &str) -> Result<MsgId>
//   pub async fn get_msg_reactions(context, msg_id) -> Result<Reactions>
// `Reactions::iter()` yields `(&ContactId, &Reaction)`, and
// `Reaction::as_str()` returns the emoji string. The brief assumed the
// return was an iterable of `{ reaction, contact_id }`; that is NOT the
// real API — we adapt via `.iter()` + `.as_str()` below.

#[tauri::command]
pub async fn send_reaction(
    state: State<'_, AppState>,
    chat_id: u32,
    msg_id: u32,
    emoji: String,
) -> AppResult<()> {
    let _chat_id = chat_id; // kept for API symmetry; reaction targets msg_id only
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let msg_id = MsgId::new(msg_id);
    // send_reaction returns the reaction message's MsgId; caller doesn't need it.
    let _reaction_msg_id = reaction::send_reaction(&ctx, msg_id, &emoji).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_reactions(
    state: State<'_, AppState>,
    msg_id: u32,
) -> AppResult<Vec<ReactionDto>> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let msg_id = MsgId::new(msg_id);
    let reactions = reaction::get_msg_reactions(&ctx, msg_id).await?;
    let mut grouped: std::collections::HashMap<String, Vec<u32>> =
        std::collections::HashMap::new();
    for (contact_id, reaction) in reactions.iter() {
        grouped
            .entry(reaction.as_str().to_string())
            .or_default()
            .push(contact_id.to_u32());
    }
    Ok(grouped
        .into_iter()
        .map(|(emoji, senders)| ReactionDto {
            count: senders.len() as i64,
            senders,
            emoji,
        })
        .collect())
}

// ── reply command ───────────────────────────────────────────────────────────
//
// Verified against `core/src/message.rs` + `core/src/chat.rs`:
//   Message::new_text(text: String) -> Message            (line 483)
//   Message::load_from_db(&Context, MsgId) -> Result<Message>   (line 495)
//   Message::set_quote(&mut self, &Context, Option<&Message>) -> Result<()>  (line 1260)
//   chat::send_msg(&Context, ChatId, &mut Message) -> Result<MsgId>          (line 2616)
// All signatures match the brief.

#[tauri::command]
pub async fn send_reply(
    state: State<'_, AppState>,
    chat_id: u32,
    text: String,
    quote_msg_id: u32,
) -> AppResult<u32> {
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let chat_id = deltachat::chat::ChatId::new(chat_id);
    let mut msg = Message::new_text(text);
    let quote = Message::load_from_db(&ctx, MsgId::new(quote_msg_id)).await?;
    msg.set_quote(&ctx, Some(&quote)).await?;
    let sent_id = chat::send_msg(&ctx, chat_id, &mut msg).await?;
    Ok(sent_id.to_u32())
}

// ── topic commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_channel_topic(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<Option<String>> {
    // topic 存在 channels 表，需查 db。
    // channels 表按 workspace_id 查，这里遍历所有 workspace 查找该 chat_id。
    let workspaces = state.db.list_workspaces().await?;
    for ws in workspaces {
        let chans = state.db.list_channels(ws.id).await?;
        if let Some(ch) = chans.iter().find(|c| c.chat_id == chat_id) {
            return Ok(ch.topic.clone());
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn set_channel_topic(
    state: State<'_, AppState>,
    chat_id: u32,
    topic: String,
) -> AppResult<()> {
    // 直接 UPDATE channels SET topic = ? WHERE chat_id = ?
    // rusqlite 是同步 API，必须放到 spawn_blocking 里。
    let conn = state.db.conn.clone();
    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let c = conn.blocking_lock();
        c.execute(
            "UPDATE channels SET topic = ?1 WHERE chat_id = ?2",
            rusqlite::params![topic, chat_id as i64],
        )?;
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn validate_channels(state: State<'_, AppState>) -> AppResult<u32> {
    // 校验 channels 表里的 chat_id 是否仍存在于 core
    let ctx = state.current().await.ok_or(AppError::Core("no account".into()))?;
    let workspaces = state.db.list_workspaces().await?;
    let mut removed = 0u32;
    for ws in workspaces {
        let chans = state.db.list_channels(ws.id).await?;
        for ch in chans {
            let chat_id = deltachat::chat::ChatId::new(ch.chat_id);
            if Chat::load_from_db(&ctx, chat_id).await.is_err() {
                // 频道已不存在，从本地表删除
                let conn = state.db.conn.clone();
                let chat_id_i64 = ch.chat_id as i64;
                tokio::task::spawn_blocking(move || -> AppResult<()> {
                    let c = conn.blocking_lock();
                    c.execute("DELETE FROM channels WHERE chat_id = ?1", rusqlite::params![chat_id_i64])?;
                    Ok(())
                }).await??;
                removed += 1;
            }
        }
    }
    Ok(removed)
}

// ── management commands (SP2 Task 2) ─────────────────────────────────────────
//
// API 签名已对照 core 源码核实:
//   chat::remove_contact_from_chat(&Context, ChatId, ContactId) -> Result<()>
//     (core 中无 leave_group 函数; 退群 = 移除 SELF, 与既有 leave_group 命令一致)
//   deltachat::securejoin::get_securejoin_qr(&Context, Option<ChatId>) -> Result<String>
//   deltachat::message::delete_msgs(&Context, &[MsgId]) -> Result<()>
//   ctx.set_config(Config::Displayname, Option<&str>) -> Result<()>
//   Accounts::select_account(&mut self, u32) — 无 unselect_account;
//     logout 通过清空 state.current_id 实现脱离当前账号 (Accounts 层选中状态
//     因 core 无公开 API 无法持久清空, 仅清内存).

#[tauri::command]
pub async fn update_workspace(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    icon: Option<String>,
) -> AppResult<()> {
    state
        .db
        .update_workspace(id, name.as_deref(), icon.as_deref())
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<()> {
    let ctx = state
        .current()
        .await
        .ok_or(AppError::Core("no account".into()))?;
    // leave 所有关联的 core chat (channels + master)
    let chans = state.db.list_channels(id).await?;
    for ch in chans {
        let _ = chat::remove_contact_from_chat(
            &ctx,
            deltachat::chat::ChatId::new(ch.chat_id),
            ContactId::SELF,
        )
        .await;
    }
    let wss = state.db.list_workspaces().await?;
    if let Some(ws) = wss.into_iter().find(|w| w.id == id) {
        let _ = chat::remove_contact_from_chat(
            &ctx,
            deltachat::chat::ChatId::new(ws.master_chat_id),
            ContactId::SELF,
        )
        .await;
    }
    // 删本地元数据
    state.db.delete_workspace_rows(id).await?;
    Ok(())
}

#[tauri::command]
pub async fn leave_workspace(
    state: State<'_, AppState>,
    id: i64,
) -> AppResult<()> {
    // leave 只删本地元数据, 不动 core chat (保留可重新加入)
    state.db.delete_workspace_rows(id).await?;
    Ok(())
}

#[tauri::command]
pub async fn update_channel(
    state: State<'_, AppState>,
    chat_id: u32,
    name: Option<String>,
    topic: Option<String>,
    category: Option<String>,
) -> AppResult<()> {
    state
        .db
        .update_channel(chat_id, name.as_deref(), topic.as_deref(), category.as_deref())
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_channel(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<()> {
    let ctx = state
        .current()
        .await
        .ok_or(AppError::Core("no account".into()))?;
    chat::remove_contact_from_chat(
        &ctx,
        deltachat::chat::ChatId::new(chat_id),
        ContactId::SELF,
    )
    .await?;
    state.db.delete_channel_row(chat_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn leave_channel(
    state: State<'_, AppState>,
    chat_id: u32,
) -> AppResult<()> {
    state.db.delete_channel_row(chat_id).await?;
    Ok(())
}

#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<()> {
    let ctx = state
        .current()
        .await
        .ok_or(AppError::Core("no account".into()))?;
    ctx.set_config(Config::Displayname, Some(&name)).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_my_qr(state: State<'_, AppState>) -> AppResult<String> {
    let ctx = state
        .current()
        .await
        .ok_or(AppError::Core("no account".into()))?;
    // 传 None 返回个人 QR (verified: get_securejoin_qr(&Context, Option<ChatId>))
    let qr = securejoin::get_securejoin_qr(&ctx, None).await?;
    Ok(qr)
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> AppResult<()> {
    // stop_io 当前账号; clear 内存 current_id.
    // core Accounts 无 unselect_account 公开 API, select_account(0) 会因
    // "invalid account id" 失败, 故仅清内存层 (Accounts 持久选中状态保留).
    let accounts = state.accounts.lock().await;
    if let Some(id) = accounts.get_selected_account_id() {
        if let Some(ctx) = accounts.get_account(id) {
            ctx.stop_io().await;
        }
    }
    drop(accounts);
    *state.current_id.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn delete_msg(
    state: State<'_, AppState>,
    msg_id: u32,
) -> AppResult<()> {
    let ctx = state
        .current()
        .await
        .ok_or(AppError::Core("no account".into()))?;
    let ids = vec![MsgId::new(msg_id)];
    message::delete_msgs(&ctx, &ids).await?;
    Ok(())
}
