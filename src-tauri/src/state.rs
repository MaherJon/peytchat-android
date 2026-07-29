use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;

use tokio::sync::Mutex;

use deltachat::accounts::Accounts;
use deltachat::context::Context;

use crate::error::AppResult;

pub struct AppState {
    pub accounts: Arc<Mutex<Accounts>>,
    pub current_id: StdMutex<Option<u32>>,
}

impl AppState {
    pub async fn new(dir: PathBuf) -> AppResult<Self> {
        tokio::fs::create_dir_all(&dir).await?;
        let accounts = Accounts::new(dir, true).await?;
        Ok(Self {
            accounts: Arc::new(Mutex::new(accounts)),
            current_id: StdMutex::new(None),
        })
    }

    pub async fn current(&self) -> Option<Context> {
        let id = *self.current_id.lock().unwrap();
        let accounts = self.accounts.lock().await;
        accounts.get_account(id?)
    }

    pub fn set_current(&self, id: u32) {
        *self.current_id.lock().unwrap() = Some(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "multi_thread")]
    async fn test_state_init_and_add_account() {
        let tmp = tempfile::tempdir().unwrap();
        let state = AppState::new(tmp.path().join("accounts")).await.unwrap();
        assert!(state.current().await.is_none());

        let id = {
            let mut accounts = state.accounts.lock().await;
            accounts.add_account().await.unwrap()
        };
        state.set_current(id);
        assert_eq!(*state.current_id.lock().unwrap(), Some(id));
        assert!(state.current().await.is_some());
    }
}
