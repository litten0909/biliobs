//! 通过 obs-websocket v5（OBS 28+ 内置）控制 OBS 推流。

use obws::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObsConfig {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub password: String,
}

impl Default for ObsConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 4455,
            password: String::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ObsStatus {
    pub connected: bool,
    pub streaming: bool,
    pub reconnecting: bool,
    pub duration_ms: u64,
    pub bytes: u64,
    pub skipped_frames: u32,
    pub total_frames: u32,
}

/// OBS「自定义」推流服务的设置项。
#[derive(Serialize)]
struct CustomService<'a> {
    server: &'a str,
    key: &'a str,
    use_auth: bool,
    bwtest: bool,
}

#[derive(Default)]
pub struct Obs {
    client: Mutex<Option<Client>>,
}

fn describe(err: &obws::error::Error) -> String {
    use obws::error::Error as E;
    match err {
        E::Connect(_) | E::InvalidUri(_) => {
            "连接不上 OBS。请确认 OBS 已打开，并在「工具 → WebSocket 服务器设置」中启用了服务器".into()
        }
        E::Timeout => "连接 OBS 超时，请检查地址和端口".into(),
        E::Handshake(_) => "OBS 拒绝了连接，请检查 WebSocket 密码是否正确".into(),
        E::Send(_) | E::ReceiveMessage(_) => "与 OBS 的连接已断开".into(),
        other => format!("OBS 返回错误：{other}"),
    }
}

fn is_disconnect(err: &obws::error::Error) -> bool {
    matches!(
        err,
        obws::error::Error::Send(_) | obws::error::Error::ReceiveMessage(_)
    )
}

impl Obs {
    pub async fn connect(&self, config: &ObsConfig) -> AppResult<()> {
        let password = (!config.password.is_empty()).then_some(config.password.as_str());
        let client = Client::connect(config.host.as_str(), config.port, password)
            .await
            .map_err(|e| AppError::Obs(describe(&e)))?;
        *self.client.lock().await = Some(client);
        Ok(())
    }

    pub async fn disconnect(&self) {
        if let Some(mut client) = self.client.lock().await.take() {
            client.disconnect().await;
        }
    }

    pub async fn status(&self) -> ObsStatus {
        let mut guard = self.client.lock().await;
        let Some(client) = guard.as_ref() else {
            return ObsStatus::default();
        };
        match client.streaming().status().await {
            Ok(s) => ObsStatus {
                connected: true,
                streaming: s.active,
                reconnecting: s.reconnecting,
                duration_ms: s.duration.whole_milliseconds().max(0) as u64,
                bytes: s.bytes,
                skipped_frames: s.skipped_frames,
                total_frames: s.total_frames,
            },
            Err(e) => {
                if is_disconnect(&e) {
                    *guard = None;
                    ObsStatus::default()
                } else {
                    ObsStatus {
                        connected: true,
                        ..ObsStatus::default()
                    }
                }
            }
        }
    }

    /// 把推流地址和推流码写入 OBS，并开始推流。
    pub async fn start_stream(&self, server: &str, key: &str) -> AppResult<()> {
        let mut guard = self.client.lock().await;
        let client = guard
            .as_ref()
            .ok_or_else(|| AppError::Obs("尚未连接 OBS".into()))?;

        let result = async {
            let status = client.streaming().status().await?;
            if status.active {
                // 已经在推流：地址可能是旧的，先停掉再用新地址重推。
                client.streaming().stop().await?;
                for _ in 0..20 {
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    if !client.streaming().status().await?.active {
                        break;
                    }
                }
            }
            client
                .config()
                .set_stream_service_settings(
                    "rtmp_custom",
                    &CustomService {
                        server,
                        key,
                        use_auth: false,
                        bwtest: false,
                    },
                )
                .await?;
            client.streaming().start().await
        }
        .await;

        result.map_err(|e| {
            if is_disconnect(&e) {
                *guard = None;
            }
            AppError::Obs(describe(&e))
        })
    }

    pub async fn stop_stream(&self) -> AppResult<()> {
        let mut guard = self.client.lock().await;
        let Some(client) = guard.as_ref() else {
            return Ok(());
        };
        let result = async {
            if client.streaming().status().await?.active {
                client.streaming().stop().await?;
            }
            Ok::<_, obws::error::Error>(())
        }
        .await;
        result.map_err(|e| {
            if is_disconnect(&e) {
                *guard = None;
            }
            AppError::Obs(describe(&e))
        })
    }
}
