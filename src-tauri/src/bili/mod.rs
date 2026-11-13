//! B站接口封装。接口均为非官方接口，参数参考 bilibili-API-collect。

pub mod sign;

use std::collections::BTreeMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::header::{HeaderMap, HeaderValue, COOKIE, REFERER, SET_COOKIE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};

const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/// 直播姬（pc_link）的 appkey / appsec，公开于 bilibili-API-collect。
const LIVEHIME_APPKEY: &str = "aae92bc66f3edfab";
const LIVEHIME_APPSEC: &str = "af125a0d5279fd576c1b4418a3e8276d";

/// 查询不到最新版本时使用的兜底直播姬版本。
const FALLBACK_VERSION: &str = "8.14.0.11278";
const FALLBACK_BUILD: u64 = 11278;

/// 开播接口返回「需要人脸认证」时的业务码。
const CODE_FACE_AUTH: i64 = 60024;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Credentials {
    pub cookies: BTreeMap<String, String>,
}

impl Credentials {
    fn get(&self, key: &str) -> &str {
        self.cookies.get(key).map(String::as_str).unwrap_or("")
    }
    pub fn csrf(&self) -> &str {
        self.get("bili_jct")
    }
    pub fn mid(&self) -> &str {
        self.get("DedeUserID")
    }
    pub fn is_complete(&self) -> bool {
        ["SESSDATA", "bili_jct", "DedeUserID"]
            .iter()
            .all(|k| !self.get(k).is_empty())
    }
    fn cookie_header(&self) -> String {
        self.cookies
            .iter()
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("; ")
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QrCode {
    pub url: String,
    pub key: String,
}

#[derive(Debug)]
pub enum QrState {
    Waiting,
    Scanned,
    Expired,
    Success(Credentials),
}

#[derive(Debug, Clone, Serialize)]
pub struct User {
    pub mid: u64,
    pub name: String,
    pub face: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Room {
    pub room_id: u64,
    pub title: String,
    pub cover: String,
    pub is_live: bool,
    pub area_id: u64,
    pub area_name: String,
    pub parent_area_id: u64,
    pub parent_area_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Area {
    pub id: u64,
    pub name: String,
    pub pic: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AreaGroup {
    pub id: u64,
    pub name: String,
    pub areas: Vec<Area>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StreamInfo {
    pub server: String,
    pub key: String,
}

#[derive(Debug, Clone)]
pub struct LiveHimeVersion {
    pub version: String,
    pub build: u64,
}

#[derive(Deserialize)]
struct ApiResp {
    code: i64,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    msg: Option<String>,
    #[serde(default)]
    data: Value,
}

impl ApiResp {
    fn message(&self) -> String {
        self.message
            .clone()
            .or_else(|| self.msg.clone())
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| format!("B站返回错误码 {}", self.code))
    }

    fn into_data(self) -> AppResult<Value> {
        match self.code {
            0 => Ok(self.data),
            -101 => Err(AppError::NotLoggedIn),
            code => Err(AppError::Api {
                code,
                message: self.message(),
            }),
        }
    }
}

/// B站部分字段时而是数字时而是字符串，统一转成 u64。
fn as_u64(v: &Value) -> u64 {
    v.as_u64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(0)
}

fn as_string(v: &Value) -> String {
    v.as_str().unwrap_or_default().to_string()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Clone)]
pub struct BiliClient {
    http: reqwest::Client,
}

impl BiliClient {
    pub fn new() -> AppResult<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(WEB_UA));
        headers.insert(
            REFERER,
            HeaderValue::from_static("https://link.bilibili.com/"),
        );
        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(15))
            .build()?;
        Ok(Self { http })
    }

    async fn get(
        &self,
        url: &str,
        query: &[(&str, String)],
        creds: Option<&Credentials>,
    ) -> AppResult<Value> {
        let mut req = self.http.get(url).query(query);
        if let Some(c) = creds {
            req = req.header(COOKIE, c.cookie_header());
        }
        let resp: ApiResp = req.send().await?.error_for_status()?.json().await?;
        resp.into_data()
    }

    // ---------- 登录 ----------

    pub async fn qr_generate(&self) -> AppResult<QrCode> {
        let data = self
            .get(
                "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
                &[],
                None,
            )
            .await?;
        Ok(QrCode {
            url: as_string(&data["url"]),
            key: as_string(&data["qrcode_key"]),
        })
    }

    pub async fn qr_poll(&self, key: &str) -> AppResult<QrState> {
        let resp = self
            .http
            .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
            .query(&[("qrcode_key", key)])
            .send()
            .await?
            .error_for_status()?;

        // 登录成功时凭据通过 Set-Cookie 下发。
        let mut creds = Credentials::default();
        for value in resp.headers().get_all(SET_COOKIE) {
            let Ok(text) = value.to_str() else { continue };
            let pair = text.split(';').next().unwrap_or("");
            if let Some((k, v)) = pair.split_once('=') {
                creds
                    .cookies
                    .insert(k.trim().to_string(), v.trim().to_string());
            }
        }

        let body: ApiResp = resp.json().await?;
        let data = body.into_data()?;
        match data["code"].as_i64().unwrap_or(-1) {
            0 => {
                if !creds.is_complete() {
                    return Err(AppError::Other(
                        "登录成功但未取得完整凭据，请重试".into(),
                    ));
                }
                // buvid3 是设备标识，开播请求会带上；取不到不影响登录。
                if let Ok(buvid3) = self.fetch_buvid3().await {
                    creds.cookies.insert("buvid3".into(), buvid3);
                }
                Ok(QrState::Success(creds))
            }
            86090 => Ok(QrState::Scanned),
            86038 => Ok(QrState::Expired),
            _ => Ok(QrState::Waiting),
        }
    }

    async fn fetch_buvid3(&self) -> AppResult<String> {
        let data = self
            .get("https://api.bilibili.com/x/frontend/finger/spi", &[], None)
            .await?;
        Ok(as_string(&data["b_3"]))
    }

    pub async fn user(&self, creds: &Credentials) -> AppResult<User> {
        let data = self
            .get(
                "https://api.bilibili.com/x/web-interface/nav",
                &[],
                Some(creds),
            )
            .await?;
        if !data["isLogin"].as_bool().unwrap_or(false) {
            return Err(AppError::NotLoggedIn);
        }
        Ok(User {
            mid: as_u64(&data["mid"]),
            name: as_string(&data["uname"]),
            face: as_string(&data["face"]),
        })
    }

    // ---------- 直播间 ----------

    pub async fn room(&self, creds: &Credentials) -> AppResult<Room> {
        let old = self
            .get(
                "https://api.live.bilibili.com/room/v1/Room/getRoomInfoOld",
                &[("mid", creds.mid().to_string())],
                Some(creds),
            )
            .await?;
        let room_id = as_u64(&old["roomid"]);
        if room_id == 0 {
            return Err(AppError::NoRoom);
        }

        let base = self
            .get(
                "https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo",
                &[
                    ("req_biz", "web_room_componet".to_string()),
                    ("room_ids", room_id.to_string()),
                ],
                Some(creds),
            )
            .await?;
        let info = base["by_room_ids"]
            .as_object()
            .and_then(|m| m.values().next())
            .cloned()
            .unwrap_or(Value::Null);

        Ok(Room {
            room_id,
            title: info["title"]
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| as_string(&old["title"])),
            cover: info["cover"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| as_string(&old["cover"])),
            is_live: info["live_status"]
                .as_u64()
                .unwrap_or_else(|| as_u64(&old["liveStatus"]))
                == 1,
            area_id: as_u64(&info["area_id"]),
            area_name: as_string(&info["area_name"]),
            parent_area_id: as_u64(&info["parent_area_id"]),
            parent_area_name: as_string(&info["parent_area_name"]),
        })
    }

    pub async fn areas(&self) -> AppResult<Vec<AreaGroup>> {
        let data = self
            .get("https://api.live.bilibili.com/room/v1/Area/getList", &[], None)
            .await?;
        let groups = data
            .as_array()
            .map(|groups| {
                groups
                    .iter()
                    .map(|g| AreaGroup {
                        id: as_u64(&g["id"]),
                        name: as_string(&g["name"]),
                        areas: g["list"]
                            .as_array()
                            .map(|list| {
                                list.iter()
                                    .map(|a| Area {
                                        id: as_u64(&a["id"]),
                                        name: as_string(&a["name"]),
                                        pic: as_string(&a["pic"]),
                                    })
                                    .collect()
                            })
                            .unwrap_or_default(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(groups)
    }

    /// 主播最近使用过的分区 id，用于快捷切换。
    pub async fn recent_areas(&self, creds: &Credentials, room_id: u64) -> AppResult<Vec<u64>> {
        let data = self
            .get(
                "https://api.live.bilibili.com/room/v1/Area/getMyChooseArea",
                &[("roomid", room_id.to_string())],
                Some(creds),
            )
            .await?;
        Ok(data
            .as_array()
            .map(|list| {
                list.iter()
                    .map(|a| as_u64(&a["id"]))
                    .filter(|id| *id > 0)
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn update_title(
        &self,
        creds: &Credentials,
        room_id: u64,
        title: &str,
    ) -> AppResult<()> {
        let form = [
            ("room_id", room_id.to_string()),
            ("title", title.to_string()),
            ("csrf", creds.csrf().to_string()),
            ("csrf_token", creds.csrf().to_string()),
        ];
        let resp: ApiResp = self
            .http
            .post("https://api.live.bilibili.com/room/v1/Room/update")
            .header(COOKIE, creds.cookie_header())
            .form(&form)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        resp.into_data().map(|_| ())
    }

    /// 提交一个带 Cookie 的表单请求，只关心成功与否。
    async fn post_form(
        &self,
        url: &str,
        creds: &Credentials,
        form: &[(&str, String)],
    ) -> AppResult<Value> {
        let resp: ApiResp = self
            .http
            .post(url)
            .header(COOKIE, creds.cookie_header())
            .timeout(Duration::from_secs(30))
            .form(form)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        resp.into_data()
    }

    /// 更换分区。直播中也可以调用，会立即生效。
    pub async fn change_area(
        &self,
        creds: &Credentials,
        room_id: u64,
        area_id: u64,
    ) -> AppResult<()> {
        self.post_form(
            "https://api.live.bilibili.com/xlive/app-blink/v2/room/AnchorChangeRoomArea",
            creds,
            &[
                ("platform", "pc".to_string()),
                ("room_id", room_id.to_string()),
                ("area_id", area_id.to_string()),
                ("csrf", creds.csrf().to_string()),
                ("csrf_token", creds.csrf().to_string()),
            ],
        )
        .await
        .map(|_| ())
    }

    pub async fn news(&self, creds: &Credentials, room_id: u64) -> AppResult<String> {
        let data = self
            .get(
                "https://api.live.bilibili.com/xlive/app-blink/v1/index/getRoomNews",
                &[
                    ("room_id", room_id.to_string()),
                    ("uid", creds.mid().to_string()),
                ],
                Some(creds),
            )
            .await?;
        Ok(as_string(&data["content"]))
    }

    pub async fn update_news(
        &self,
        creds: &Credentials,
        room_id: u64,
        content: &str,
    ) -> AppResult<()> {
        self.post_form(
            "https://api.live.bilibili.com/xlive/app-blink/v1/index/updateRoomNews",
            creds,
            &[
                ("room_id", room_id.to_string()),
                ("uid", creds.mid().to_string()),
                ("content", content.to_string()),
                ("csrf", creds.csrf().to_string()),
                ("csrf_token", creds.csrf().to_string()),
            ],
        )
        .await
        .map(|_| ())
    }

    /// 上传 JPEG 封面并设为直播间封面，返回图片地址。新封面需经 B站审核后才会展示。
    pub async fn update_cover(&self, creds: &Credentials, jpeg: Vec<u8>) -> AppResult<String> {
        let file = reqwest::multipart::Part::bytes(jpeg)
            .file_name("blob")
            .mime_str("image/jpeg")
            .map_err(|e| AppError::Other(e.to_string()))?;
        let form = reqwest::multipart::Form::new()
            .text("bucket", "live")
            .text("dir", "new_room_cover")
            .text("csrf", creds.csrf().to_string())
            .part("file", file);
        let resp: ApiResp = self
            .http
            .post("https://api.bilibili.com/x/upload/web/image")
            .header(COOKIE, creds.cookie_header())
            .timeout(Duration::from_secs(60))
            .multipart(form)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let url = as_string(&resp.into_data()?["location"]);
        if url.is_empty() {
            return Err(AppError::Other("封面上传成功，但没有返回图片地址".into()));
        }

        self.post_form(
            "https://api.live.bilibili.com/xlive/app-blink/v1/preLive/UpdatePreLiveInfo",
            creds,
            &[
                ("platform", "web".to_string()),
                ("mobi_app", "web".to_string()),
                ("build", "1".to_string()),
                ("cover", url.clone()),
                ("coverVertical", String::new()),
                ("liveDirectionType", "1".to_string()),
                ("csrf", creds.csrf().to_string()),
                ("csrf_token", creds.csrf().to_string()),
            ],
        )
        .await?;
        Ok(url)
    }

    // ---------- 开播 / 下播 ----------

    /// 查询直播姬当前版本。B站会校验开播请求里的版本号，过旧会被拒绝。
    pub async fn livehime_version(&self) -> LiveHimeVersion {
        let fetched = self
            .get(
                "https://api.live.bilibili.com/xlive/app-blink/v1/liveVersionInfo/getHomePageLiveVersion",
                &[("system_version", "2".to_string())],
                None,
            )
            .await
            .ok()
            .and_then(|data| {
                let version = data["curr_version"].as_str()?.to_string();
                let build = data["build"].as_u64()?;
                Some(LiveHimeVersion { version, build })
            });
        fetched.unwrap_or_else(|| LiveHimeVersion {
            version: FALLBACK_VERSION.into(),
            build: FALLBACK_BUILD,
        })
    }

    pub async fn start_live(
        &self,
        creds: &Credentials,
        room_id: u64,
        area_id: u64,
    ) -> AppResult<StreamInfo> {
        let ver = self.livehime_version().await;
        let csrf = creds.csrf().to_string();
        let params = sign::app_sign(
            vec![
                ("access_key".into(), String::new()),
                ("appkey".into(), LIVEHIME_APPKEY.into()),
                ("platform".into(), "pc_link".into()),
                ("room_id".into(), room_id.to_string()),
                ("area_v2".into(), area_id.to_string()),
                ("build".into(), ver.build.to_string()),
                ("backup_stream".into(), "0".into()),
                ("csrf".into(), csrf.clone()),
                ("csrf_token".into(), csrf),
                ("ts".into(), now_secs().to_string()),
                ("type".into(), "2".into()),
                ("version".into(), ver.version.clone()),
            ],
            LIVEHIME_APPSEC,
        );

        let ua = format!(
            "LiveHime/{} os/Windows pc_app/livehime build/{} osVer/10.0.19045_x86_64",
            ver.version, ver.build
        );
        let trace_id = format!(
            "PC_LINK:{}:{}",
            uuid::Uuid::new_v4(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );
        let mut req = self
            .http
            .post("https://api.live.bilibili.com/room/v1/Room/startLive")
            .header(USER_AGENT, ua)
            .header(COOKIE, creds.cookie_header())
            .header("X-Event-TraceID", trace_id)
            .timeout(Duration::from_secs(30));
        let buvid3 = creds.get("buvid3");
        if !buvid3.is_empty() {
            req = req.header("buvid", buvid3);
        }

        let resp: ApiResp = req
            .form(&params)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let face_qr = resp.data["qr"].as_str().unwrap_or_default().to_string();
        if resp.code == CODE_FACE_AUTH
            || (resp.code != 0 && !face_qr.is_empty())
            || resp.data["need_face_auth"].as_bool().unwrap_or(false)
        {
            let qr = if face_qr.is_empty() {
                format!(
                    "https://www.bilibili.com/blackboard/live/face-auth-middle.html?source_event=400&mid={}",
                    creds.mid()
                )
            } else {
                face_qr
            };
            return Err(AppError::FaceAuth { qr });
        }

        let data = resp.into_data()?;
        let server = as_string(&data["rtmp"]["addr"]);
        let key = as_string(&data["rtmp"]["code"]);
        if server.is_empty() || key.is_empty() {
            return Err(AppError::Other(
                "开播成功，但 B站没有返回推流地址".into(),
            ));
        }
        Ok(StreamInfo { server, key })
    }

    /// 查询账号是否已完成开播所需的人脸认证，供认证弹窗轮询。
    pub async fn face_auth_done(&self, creds: &Credentials, room_id: u64) -> AppResult<bool> {
        let form = [
            ("room_id", room_id.to_string()),
            ("face_auth_code", CODE_FACE_AUTH.to_string()),
            ("csrf", creds.csrf().to_string()),
            ("csrf_token", creds.csrf().to_string()),
            ("visit_id", String::new()),
        ];
        let resp: ApiResp = self
            .http
            .post("https://api.live.bilibili.com/xlive/app-blink/v1/preLive/IsUserIdentifiedByFaceAuth")
            .header(COOKIE, creds.cookie_header())
            .form(&form)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let data = resp.into_data()?;
        Ok(data["is_identified"].as_bool().unwrap_or(false))
    }

    pub async fn stop_live(&self, creds: &Credentials, room_id: u64) -> AppResult<()> {
        let form = [
            ("platform", "pc_link".to_string()),
            ("room_id", room_id.to_string()),
            ("csrf", creds.csrf().to_string()),
            ("csrf_token", creds.csrf().to_string()),
        ];
        let resp: ApiResp = self
            .http
            .post("https://api.live.bilibili.com/room/v1/Room/stopLive")
            .header(COOKIE, creds.cookie_header())
            .timeout(Duration::from_secs(30))
            .form(&form)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        resp.into_data().map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resp(json: &str) -> ApiResp {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn ok_response_yields_data() {
        let data = resp(r#"{"code":0,"data":{"a":1}}"#).into_data().unwrap();
        assert_eq!(data["a"], 1);
    }

    #[test]
    fn not_logged_in_code_is_mapped() {
        let err = resp(r#"{"code":-101,"message":"账号未登录"}"#)
            .into_data()
            .unwrap_err();
        assert!(matches!(err, AppError::NotLoggedIn));
    }

    #[test]
    fn api_error_uses_msg_when_message_missing() {
        let err = resp(r#"{"code":1,"msg":"参数错误"}"#).into_data().unwrap_err();
        assert_eq!(err.to_string(), "参数错误");
    }

    #[test]
    fn numeric_strings_are_parsed() {
        assert_eq!(as_u64(&serde_json::json!("86")), 86);
        assert_eq!(as_u64(&serde_json::json!(86)), 86);
        assert_eq!(as_u64(&serde_json::json!(null)), 0);
    }

    /// 访问真实 B站接口的冒烟测试，默认不跑：`cargo test -- --ignored`
    #[tokio::test]
    #[ignore = "需要联网访问 B站"]
    async fn live_public_endpoints() {
        let client = BiliClient::new().unwrap();

        let qr = client.qr_generate().await.unwrap();
        assert!(qr.url.starts_with("https://"), "qr url: {}", qr.url);
        assert!(!qr.key.is_empty());
        assert!(matches!(
            client.qr_poll(&qr.key).await.unwrap(),
            QrState::Waiting
        ));

        let areas = client.areas().await.unwrap();
        assert!(areas.len() > 3);
        assert!(areas.iter().all(|g| g.id > 0 && !g.areas.is_empty()));
        assert!(areas[0].areas.iter().all(|a| a.id > 0 && !a.name.is_empty()));

        let ver = client.livehime_version().await;
        assert!(ver.build >= FALLBACK_BUILD, "build: {}", ver.build);
        assert!(ver.version.ends_with(&ver.build.to_string()));

        assert!(!client.fetch_buvid3().await.unwrap().is_empty());

        // 伪造的凭据应当被识别为未登录，而不是其它错误。
        let mut fake = Credentials::default();
        for k in ["SESSDATA", "bili_jct", "DedeUserID"] {
            fake.cookies.insert(k.into(), "1".into());
        }
        assert!(matches!(
            client.user(&fake).await,
            Err(AppError::NotLoggedIn)
        ));
    }

    #[test]
    fn credentials_completeness() {
        let mut c = Credentials::default();
        assert!(!c.is_complete());
        for k in ["SESSDATA", "bili_jct", "DedeUserID"] {
            c.cookies.insert(k.into(), "x".into());
        }
        assert!(c.is_complete());
        assert_eq!(c.cookie_header(), "DedeUserID=x; SESSDATA=x; bili_jct=x");
    }
}
