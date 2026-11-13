//! 敏感数据（登录凭据、OBS WebSocket 密码）存放在系统钥匙串中，不落明文文件。

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::error::{AppError, AppResult};

const SERVICE: &str = "app.biliobs.desktop";

pub const KEY_ACCOUNT: &str = "account";
pub const KEY_OBS: &str = "obs";

fn entry(key: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, key)
        .map_err(|e| AppError::Other(format!("无法访问系统钥匙串：{e}")))
}

pub fn load<T: DeserializeOwned>(key: &str) -> Option<T> {
    let text = entry(key).ok()?.get_password().ok()?;
    serde_json::from_str(&text).ok()
}

pub fn save<T: Serialize>(key: &str, value: &T) -> AppResult<()> {
    let text = serde_json::to_string(value).map_err(|e| AppError::Other(e.to_string()))?;
    entry(key)?
        .set_password(&text)
        .map_err(|e| AppError::Other(format!("写入系统钥匙串失败：{e}")))
}

pub fn remove(key: &str) {
    if let Ok(entry) = entry(key) {
        let _ = entry.delete_credential();
    }
}
