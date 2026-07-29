mod commands;
mod dto;
mod error;
mod events;
mod state;

use tauri::Manager;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("no app data dir");
            let accounts_dir = dir.join("accounts");
            let state = tauri::async_runtime::block_on(async move {
                AppState::new(accounts_dir).await
            })?;
            let handle = app.handle().clone();
            events::spawn_event_forwarder(handle, state.accounts.clone());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_configured,
            commands::login,
            commands::get_self_profile,
            commands::get_chatlist,
            commands::get_chat_msgs,
            commands::send_text,
            commands::get_contacts,
            commands::create_group,
            commands::add_group_member,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
