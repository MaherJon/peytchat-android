use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;

use tauri::{AppHandle, Emitter, State};
use serde::Serialize;

use crate::error::AppResult;
use crate::state::AppState;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub struct TerminalSessions(pub Mutex<HashMap<String, TerminalSession>>);

impl Default for TerminalSessions {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

pub struct TerminalSession {
    process: Mutex<Option<std::process::Child>>,
    output_thread: Mutex<Option<thread::JoinHandle<()>>>,
}

#[derive(Clone, Serialize)]
pub struct TerminalOutput {
    pub session_id: String,
    pub data: String,
}

// Android 的默认 shell
fn default_shell() -> String {
    // Android 通常有 /system/bin/sh
    if std::path::Path::new("/system/bin/sh").exists() {
        "/system/bin/sh".into()
    } else {
        "sh".into()
    }
}

#[tauri::command]
pub fn open_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    workdir: Option<String>,
) -> AppResult<String> {
    let session_id = NEXT_ID.fetch_add(1, Ordering::Relaxed).to_string();
    
    // 在 Android 上使用简单的 shell 执行
    let shell = default_shell();
    let mut cmd = Command::new(&shell);
    cmd.arg("-i")  // 交互模式
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    if let Some(dir) = workdir.filter(|d| !d.trim().is_empty()) {
        cmd.current_dir(dir);
    }
    
    let mut child = cmd.spawn()
        .map_err(|e| crate::error::AppError::Core(format!("无法启动终端: {}", e)))?;
    
    let app2 = app.clone();
    let sid = session_id.clone();
    let mut stdout = child.stdout.take()
        .ok_or_else(|| crate::error::AppError::Core("无法获取 stdout".into()))?;
    let mut stderr = child.stderr.take()
        .ok_or_else(|| crate::error::AppError::Core("无法获取 stderr".into()))?;
    
    // 启动读取线程
    let handle = thread::spawn(move || {
        let mut buf = [0u8; 1024];
        loop {
            match stdout.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(s) = String::from_utf8(buf[..n].to_vec()) {
                        let _ = app2.emit(
                            "terminal-output",
                            TerminalOutput {
                                session_id: sid.clone(),
                                data: s,
                            }
                        );
                    }
                }
                Err(_) => break,
            }
        }
        // 注意：这里简化了，实际可能需要同时读取 stderr
        let _ = app2.emit(
            "terminal-output",
            TerminalOutput {
                session_id: sid,
                data: "\r\n[终端会话已结束]\r\n".into(),
            }
        );
    });
    
    state.terminals.0.lock().unwrap().insert(
        session_id.clone(),
        TerminalSession {
            process: Mutex::new(Some(child)),
            output_thread: Mutex::new(Some(handle)),
        },
    );
    
    Ok(session_id)
}

#[tauri::command]
pub fn write_terminal(state: State<'_, AppState>, session_id: String, input: String) -> AppResult<()> {
    let sessions = state.terminals.0.lock().unwrap();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| crate::error::AppError::Core("终端会话不存在".into()))?;
    
    let mut process_guard = session.process.lock().unwrap();
    if let Some(process) = process_guard.as_mut() {
        if let Some(stdin) = process.stdin.as_mut() {
            use std::io::Write;
            stdin.write_all(input.as_bytes())
                .map_err(|e| crate::error::AppError::Core(format!("写入失败: {}", e)))?;
            stdin.flush()
                .map_err(|e| crate::error::AppError::Core(format!("刷新失败: {}", e)))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    _session_id: String,
    _cols: u32,
    _rows: u32,
) -> AppResult<()> {
    // Android 上 resize 功能有限，直接返回成功
    Ok(())
}

#[tauri::command]
pub fn close_terminal(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    let mut sessions = state.terminals.0.lock().unwrap();
    if let Some(session) = sessions.remove(&session_id) {
        if let Some(mut child) = session.process.lock().unwrap().take() {
            let _ = child.kill();
        }
        // 等待输出线程结束
        if let Some(handle) = session.output_thread.lock().unwrap().take() {
            let _ = handle.join();
        }
    }
    Ok(())
}