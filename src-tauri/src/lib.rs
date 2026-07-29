mod commands;
mod dto;
mod error;
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
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_configured,
            commands::login,
            commands::get_self_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
