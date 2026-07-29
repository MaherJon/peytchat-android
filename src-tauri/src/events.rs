use std::sync::Arc;

use deltachat::accounts::Accounts;
use deltachat::EventType;
use tauri::{async_runtime, AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::dto::EventPayload;

pub fn spawn_event_forwarder(app: AppHandle, accounts: Arc<Mutex<Accounts>>) {
    async_runtime::spawn(async move {
        let emitter = {
            let accounts = accounts.lock().await;
            accounts.get_event_emitter()
        };
        while let Some(event) = emitter.recv().await {
            let payload = match event.typ {
                EventType::IncomingMsg { chat_id, msg_id } => EventPayload {
                    typ: "IncomingMsg".into(),
                    chat_id: Some(chat_id.to_u32()),
                    msg_id: Some(msg_id.to_u32()),
                    contact_id: None,
                    progress: None,
                    comment: None,
                },
                EventType::MsgsChanged { chat_id, msg_id } => EventPayload {
                    typ: "MsgsChanged".into(),
                    chat_id: Some(chat_id.to_u32()),
                    msg_id: Some(msg_id.to_u32()),
                    contact_id: None,
                    progress: None,
                    comment: None,
                },
                EventType::ContactsChanged(c) => EventPayload {
                    typ: "ContactsChanged".into(),
                    chat_id: None,
                    msg_id: None,
                    contact_id: c.map(|x| x.to_u32()),
                    progress: None,
                    comment: None,
                },
                EventType::ConfigureProgress { progress, comment } => EventPayload {
                    typ: "ConfigureProgress".into(),
                    chat_id: None,
                    msg_id: None,
                    contact_id: None,
                    progress: Some(progress),
                    comment,
                },
                _ => continue,
            };
            let _ = app.emit("dc-event", payload);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payload_serialization() {
        let p = EventPayload {
            typ: "IncomingMsg".into(),
            chat_id: Some(42),
            msg_id: Some(7),
            contact_id: None,
            progress: None,
            comment: None,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"typ\":\"IncomingMsg\""));
        assert!(json.contains("\"chat_id\":42"));
        assert!(json.contains("\"msg_id\":7"));
    }

    #[test]
    fn test_configure_progress_payload() {
        let p = EventPayload {
            typ: "ConfigureProgress".into(),
            chat_id: None,
            msg_id: None,
            contact_id: None,
            progress: Some(500),
            comment: Some("connecting imap".into()),
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"typ\":\"ConfigureProgress\""));
        assert!(json.contains("\"progress\":500"));
        assert!(json.contains("\"comment\":\"connecting imap\""));
    }
}
