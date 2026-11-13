import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./mock";

export interface User {
  mid: number;
  name: string;
  face: string;
}

export interface Room {
  room_id: number;
  title: string;
  cover: string;
  is_live: boolean;
  area_id: number;
  area_name: string;
  parent_area_id: number;
  parent_area_name: string;
}

export interface Area {
  id: number;
  name: string;
  pic: string;
}

export interface AreaGroup {
  id: number;
  name: string;
  areas: Area[];
}

export interface StreamInfo {
  server: string;
  key: string;
}

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
}

export interface ObsStatus {
  connected: boolean;
  streaming: boolean;
  reconnecting: boolean;
  duration_ms: number;
  bytes: number;
  skipped_frames: number;
  total_frames: number;
}

export type QrPoll =
  | { status: "waiting" }
  | { status: "scanned" }
  | { status: "expired" }
  | { status: "success"; user: User };

export interface AppError {
  kind: "network" | "api" | "face_auth" | "not_logged_in" | "no_room" | "obs" | "other";
  message: string;
  code?: number;
  qr?: string;
}

export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "kind" in e && "message" in e) return e as AppError;
  return { kind: "other", message: typeof e === "string" ? e : String(e) };
}

/** 在普通浏览器里打开（没有 Tauri 运行时）时走模拟数据，方便只调界面。 */
export const isTauri = "__TAURI_INTERNALS__" in window;

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return isTauri ? tauriInvoke<T>(cmd, args) : mockInvoke<T>(cmd, args);
}

export const api = {
  authRestore: () => invoke<User | null>("auth_restore"),
  authQrGenerate: () => invoke<{ url: string; key: string }>("auth_qr_generate"),
  authQrPoll: (key: string) => invoke<QrPoll>("auth_qr_poll", { key }),
  authLogout: () => invoke<void>("auth_logout"),

  roomGet: () => invoke<Room>("room_get"),
  areasList: () => invoke<AreaGroup[]>("areas_list"),
  areasRecent: (roomId: number) => invoke<number[]>("areas_recent", { roomId }),
  roomUpdateTitle: (roomId: number, title: string) =>
    invoke<void>("room_update_title", { roomId, title }),
  roomChangeArea: (roomId: number, areaId: number) =>
    invoke<void>("room_change_area", { roomId, areaId }),
  roomNewsGet: (roomId: number) => invoke<string>("room_news_get", { roomId }),
  roomNewsUpdate: (roomId: number, content: string) =>
    invoke<void>("room_news_update", { roomId, content }),
  /** 上传 JPEG 封面，返回新封面地址。 */
  roomCoverUpdate: (jpeg: Uint8Array) =>
    invoke<string>("room_cover_update", { jpeg: Array.from(jpeg) }),
  liveStart: (roomId: number, areaId: number) =>
    invoke<StreamInfo>("live_start", { roomId, areaId }),
  liveFaceAuthDone: (roomId: number) => invoke<boolean>("live_face_auth_done", { roomId }),
  liveStop: (roomId: number) => invoke<void>("live_stop", { roomId }),

  obsConfigGet: () => invoke<ObsConfig>("obs_config_get"),
  obsConnect: (config: ObsConfig) => invoke<ObsStatus>("obs_connect", { config }),
  obsDisconnect: () => invoke<void>("obs_disconnect"),
  obsStatus: () => invoke<ObsStatus>("obs_status"),
  obsStartStream: (server: string, key: string) =>
    invoke<void>("obs_start_stream", { server, key }),
  obsStopStream: () => invoke<void>("obs_stop_stream"),
};

export async function openExternal(url: string) {
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}
