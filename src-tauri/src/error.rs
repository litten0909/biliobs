use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// 所有命令统一返回的错误类型。序列化为 `{ kind, message, code?, qr? }` 交给前端。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("网络请求失败：{0}")]
    Network(String),
    #[error("{message}")]
    Api { code: i64, message: String },
    #[error("当前账号需要先完成人脸认证才能开播")]
    FaceAuth { qr: String },
    #[error("登录已失效，请重新扫码登录")]
    NotLoggedIn,
    #[error("该账号还没有开通直播间")]
    NoRoom,
    #[error("{0}")]
    Obs(String),
    #[error("{0}")]
    Other(String),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Network(_) => "network",
            AppError::Api { .. } => "api",
            AppError::FaceAuth { .. } => "face_auth",
            AppError::NotLoggedIn => "not_logged_in",
            AppError::NoRoom => "no_room",
            AppError::Obs(_) => "obs",
            AppError::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 4)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        match self {
            AppError::Api { code, .. } => s.serialize_field("code", code)?,
            AppError::FaceAuth { qr } => s.serialize_field("qr", qr)?,
            _ => {}
        }
        s.end()
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            AppError::Network("请求超时，请检查网络".into())
        } else if e.is_connect() {
            AppError::Network("无法连接到 B站服务器，请检查网络".into())
        } else {
            AppError::Network(e.without_url().to_string())
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
