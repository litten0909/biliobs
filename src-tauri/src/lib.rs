mod bili;
mod error;
mod obs;
mod store;

use serde::Serialize;
use tauri::State;
use tokio::sync::RwLock;

use bili::{AreaGroup, BiliClient, Credentials, QrCode, QrState, Room, StreamInfo, User};
use error::{AppError, AppResult};
use obs::{Obs, ObsConfig, ObsStatus};

struct AppState {
    bili: BiliClient,
    creds: RwLock<Option<Credentials>>,
    obs: Obs,
}

impl AppState {
    async fn creds(&self) -> AppResult<Credentials> {
        self.creds.read().await.clone().ok_or(AppError::NotLoggedIn)
    }

    async fn clear_creds(&self) {
        *self.creds.write().await = None;
        store::remove(store::KEY_ACCOUNT);
    }

    /// 凭据失效时顺手清掉本地登录态，前端据此回到登录页。
    async fn guard<T>(&self, result: AppResult<T>) -> AppResult<T> {
        if matches!(result, Err(AppError::NotLoggedIn)) {
            self.clear_creds().await;
        }
        result
    }
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum QrPoll {
    Waiting,
    Scanned,
    Expired,
    Success { user: User },
}

// ---------- 登录 ----------

#[tauri::command]
async fn auth_restore(state: State<'_, AppState>) -> AppResult<Option<User>> {
    let Some(creds) = store::load::<Credentials>(store::KEY_ACCOUNT) else {
        return Ok(None);
    };
    match state.bili.user(&creds).await {
        Ok(user) => {
            *state.creds.write().await = Some(creds);
            Ok(Some(user))
        }
        Err(AppError::NotLoggedIn) => {
            state.clear_creds().await;
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn auth_qr_generate(state: State<'_, AppState>) -> AppResult<QrCode> {
    state.bili.qr_generate().await
}

#[tauri::command]
async fn auth_qr_poll(state: State<'_, AppState>, key: String) -> AppResult<QrPoll> {
    Ok(match state.bili.qr_poll(&key).await? {
        QrState::Waiting => QrPoll::Waiting,
        QrState::Scanned => QrPoll::Scanned,
        QrState::Expired => QrPoll::Expired,
        QrState::Success(creds) => {
            let user = state.bili.user(&creds).await?;
            store::save(store::KEY_ACCOUNT, &creds)?;
            *state.creds.write().await = Some(creds);
            QrPoll::Success { user }
        }
    })
}

#[tauri::command]
async fn auth_logout(state: State<'_, AppState>) -> AppResult<()> {
    state.clear_creds().await;
    Ok(())
}

// ---------- 直播间 ----------

#[tauri::command]
async fn room_get(state: State<'_, AppState>) -> AppResult<Room> {
    let creds = state.creds().await?;
    state.guard(state.bili.room(&creds).await).await
}

#[tauri::command]
async fn areas_list(state: State<'_, AppState>) -> AppResult<Vec<AreaGroup>> {
    state.bili.areas().await
}

#[tauri::command]
async fn areas_recent(state: State<'_, AppState>, room_id: u64) -> AppResult<Vec<u64>> {
    let creds = state.creds().await?;
    state.bili.recent_areas(&creds, room_id).await
}

#[tauri::command]
async fn room_update_title(
    state: State<'_, AppState>,
    room_id: u64,
    title: String,
) -> AppResult<()> {
    let creds = state.creds().await?;
    let result = state.bili.update_title(&creds, room_id, title.trim()).await;
    state.guard(result).await
}

#[tauri::command]
async fn room_change_area(
    state: State<'_, AppState>,
    room_id: u64,
    area_id: u64,
) -> AppResult<()> {
    let creds = state.creds().await?;
    let result = state.bili.change_area(&creds, room_id, area_id).await;
    state.guard(result).await
}

#[tauri::command]
async fn room_news_get(state: State<'_, AppState>, room_id: u64) -> AppResult<String> {
    let creds = state.creds().await?;
    state.guard(state.bili.news(&creds, room_id).await).await
}

#[tauri::command]
async fn room_news_update(
    state: State<'_, AppState>,
    room_id: u64,
    content: String,
) -> AppResult<()> {
    let creds = state.creds().await?;
    let result = state.bili.update_news(&creds, room_id, content.trim()).await;
    state.guard(result).await
}

/// 封面图片最大 4 MB，前端已压缩到远小于此，这里只做兜底。
const COVER_MAX_BYTES: usize = 4 * 1024 * 1024;

#[tauri::command]
async fn room_cover_update(state: State<'_, AppState>, jpeg: Vec<u8>) -> AppResult<String> {
    if jpeg.is_empty() || jpeg.len() > COVER_MAX_BYTES {
        return Err(AppError::Other("封面图片大小不符合要求".into()));
    }
    let creds = state.creds().await?;
    state.guard(state.bili.update_cover(&creds, jpeg).await).await
}

#[tauri::command]
async fn live_start(
    state: State<'_, AppState>,
    room_id: u64,
    area_id: u64,
) -> AppResult<StreamInfo> {
    let creds = state.creds().await?;
    let result = state.bili.start_live(&creds, room_id, area_id).await;
    state.guard(result).await
}

#[tauri::command]
async fn live_face_auth_done(state: State<'_, AppState>, room_id: u64) -> AppResult<bool> {
    let creds = state.creds().await?;
    state.bili.face_auth_done(&creds, room_id).await
}

#[tauri::command]
async fn live_stop(state: State<'_, AppState>, room_id: u64) -> AppResult<()> {
    let creds = state.creds().await?;
    state.guard(state.bili.stop_live(&creds, room_id).await).await
}

// ---------- OBS ----------

#[tauri::command]
fn obs_config_get() -> ObsConfig {
    store::load(store::KEY_OBS).unwrap_or_default()
}

#[tauri::command]
async fn obs_connect(state: State<'_, AppState>, config: ObsConfig) -> AppResult<ObsStatus> {
    state.obs.disconnect().await;
    state.obs.connect(&config).await?;
    store::save(store::KEY_OBS, &config)?;
    Ok(state.obs.status().await)
}

#[tauri::command]
async fn obs_disconnect(state: State<'_, AppState>) -> AppResult<()> {
    state.obs.disconnect().await;
    Ok(())
}

#[tauri::command]
async fn obs_status(state: State<'_, AppState>) -> AppResult<ObsStatus> {
    Ok(state.obs.status().await)
}

#[tauri::command]
async fn obs_start_stream(
    state: State<'_, AppState>,
    server: String,
    key: String,
) -> AppResult<()> {
    state.obs.start_stream(&server, &key).await
}

#[tauri::command]
async fn obs_stop_stream(state: State<'_, AppState>) -> AppResult<()> {
    state.obs.stop_stream().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        bili: BiliClient::new().expect("failed to build HTTP client"),
        creds: RwLock::new(None),
        obs: Obs::default(),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            auth_restore,
            auth_qr_generate,
            auth_qr_poll,
            auth_logout,
            room_get,
            areas_list,
            areas_recent,
            room_update_title,
            room_change_area,
            room_news_get,
            room_news_update,
            room_cover_update,
            live_start,
            live_face_auth_done,
            live_stop,
            obs_config_get,
            obs_connect,
            obs_disconnect,
            obs_status,
            obs_start_stream,
            obs_stop_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
