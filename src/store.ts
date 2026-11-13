import { create } from "zustand";
import {
  api,
  toAppError,
  type AreaGroup,
  type ObsConfig,
  type ObsStatus,
  type Room,
  type StreamInfo,
  type User,
} from "./lib/api";

export interface Toast {
  id: number;
  tone: "ok" | "error" | "info";
  text: string;
}

const OBS_OFFLINE: ObsStatus = {
  connected: false,
  streaming: false,
  reconnecting: false,
  duration_ms: 0,
  bytes: 0,
  skipped_frames: 0,
  total_frames: 0,
};

const AUTO_PUSH_KEY = "biliobs.autoPush";

interface State {
  phase: "booting" | "login" | "ready";
  user: User | null;

  room: Room | null;
  /** 直播间加载失败的原因；`no_room` 表示账号未开通直播间。 */
  roomError: { kind: string; message: string } | null;
  areas: AreaGroup[];
  /** 最近使用过的分区 id，取不到时为空，不影响其它功能。 */
  recentAreaIds: number[];
  titleDraft: string;
  areaId: number;
  /** 直播间公告；null 表示还没加载到。 */
  news: string | null;

  stream: StreamInfo | null;
  busy: "starting" | "stopping" | null;
  faceAuthQr: string | null;

  obs: ObsStatus;
  obsConfig: ObsConfig;
  obsConnecting: boolean;
  /** 是否曾成功连接过；掉线后据此自动重连。 */
  obsWanted: boolean;
  bitrateKbps: number;
  autoPush: boolean;

  toasts: Toast[];

  boot: () => Promise<void>;
  onLoggedIn: (user: User) => Promise<void>;
  logout: () => Promise<void>;
  loadRoom: () => Promise<void>;
  setTitleDraft: (title: string) => void;
  saveTitle: () => Promise<boolean>;
  /** 选择分区。未开播时只是记下，开播时生效；直播中则立即向 B站提交更换。 */
  setArea: (id: number) => Promise<void>;
  saveNews: (content: string) => Promise<boolean>;
  updateCover: (jpeg: Uint8Array) => Promise<boolean>;
  goLive: () => Promise<void>;
  endLive: () => Promise<void>;
  pushToObs: () => Promise<void>;
  dismissFaceAuth: () => void;

  connectObs: (config: ObsConfig, silent?: boolean) => Promise<boolean>;
  disconnectObs: () => Promise<void>;
  pollObs: () => Promise<void>;
  setAutoPush: (on: boolean) => void;

  toast: (tone: Toast["tone"], text: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;
let lastSample: { bytes: number; at: number } | null = null;

export const useApp = create<State>((set, get) => {
  /** 统一处理命令错误：登录失效回登录页，其余弹提示。 */
  const fail = (e: unknown, prefix = "") => {
    const err = toAppError(e);
    if (err.kind === "not_logged_in") {
      set({ phase: "login", user: null, room: null, stream: null, areaId: 0, titleDraft: "" });
    }
    get().toast("error", prefix + err.message);
    return err;
  };

  return {
    phase: "booting",
    user: null,
    room: null,
    roomError: null,
    areas: [],
    recentAreaIds: [],
    titleDraft: "",
    areaId: 0,
    news: null,
    stream: null,
    busy: null,
    faceAuthQr: null,
    obs: OBS_OFFLINE,
    obsConfig: { host: "127.0.0.1", port: 4455, password: "" },
    obsConnecting: false,
    obsWanted: false,
    bitrateKbps: 0,
    autoPush: localStorage.getItem(AUTO_PUSH_KEY) !== "0",
    toasts: [],

    boot: async () => {
      // OBS 配置与自动连接不依赖登录态，并行进行。
      api
        .obsConfigGet()
        .then((config) => {
          set({ obsConfig: config });
          return get().connectObs(config, true);
        })
        .catch(() => {});

      try {
        const user = await api.authRestore();
        if (user) await get().onLoggedIn(user);
        else set({ phase: "login" });
      } catch (e) {
        set({ phase: "login" });
        fail(e, "恢复登录失败：");
      }
    },

    onLoggedIn: async (user) => {
      set({ phase: "ready", user });
      api
        .areasList()
        .then((areas) => set({ areas }))
        .catch((e) => fail(e, "分区列表加载失败："));
      await get().loadRoom();
    },

    logout: async () => {
      await api.authLogout().catch(() => {});
      set({
        phase: "login",
        user: null,
        room: null,
        roomError: null,
        stream: null,
        areaId: 0,
        titleDraft: "",
        recentAreaIds: [],
        news: null,
      });
    },

    loadRoom: async () => {
      set({ roomError: null });
      try {
        const room = await api.roomGet();
        api
          .roomNewsGet(room.room_id)
          .then((news) => set({ news }))
          .catch(() => {});
        api
          .areasRecent(room.room_id)
          .then((recentAreaIds) => set({ recentAreaIds }))
          .catch(() => {});
        set((s) => ({
          room,
          titleDraft: s.room ? s.titleDraft : room.title,
          areaId: s.areaId || room.area_id,
          stream: room.is_live ? s.stream : null,
        }));
      } catch (e) {
        const err = toAppError(e);
        if (err.kind === "not_logged_in") fail(e);
        else set({ room: null, roomError: { kind: err.kind, message: err.message } });
      }
    },

    setTitleDraft: (titleDraft) => set({ titleDraft }),

    saveTitle: async () => {
      const { room, titleDraft } = get();
      const title = titleDraft.trim();
      if (!room || !title || title === room.title) return true;
      try {
        await api.roomUpdateTitle(room.room_id, title);
        set({ room: { ...room, title }, titleDraft: title });
        get().toast("ok", "标题已更新");
        return true;
      } catch (e) {
        fail(e, "标题修改失败：");
        return false;
      }
    },

    setArea: async (areaId) => {
      const { room } = get();
      if (!room?.is_live) {
        set({ areaId });
        return;
      }
      if (areaId === room.area_id) return;
      try {
        await api.roomChangeArea(room.room_id, areaId);
        set({ areaId });
        get().toast("ok", "分区已更换");
        await get().loadRoom();
      } catch (e) {
        fail(e, "更换分区失败：");
      }
    },

    saveNews: async (content) => {
      const { room } = get();
      if (!room) return false;
      try {
        await api.roomNewsUpdate(room.room_id, content.trim());
        set({ news: content.trim() });
        get().toast("ok", "公告已更新");
        return true;
      } catch (e) {
        fail(e, "公告修改失败：");
        return false;
      }
    },

    updateCover: async (jpeg) => {
      try {
        await api.roomCoverUpdate(jpeg);
        get().toast("ok", "封面已提交，B站审核通过后生效");
        await get().loadRoom();
        return true;
      } catch (e) {
        fail(e, "封面修改失败：");
        return false;
      }
    },

    goLive: async () => {
      const { room, areaId, busy } = get();
      if (!room || busy) return;
      if (!areaId) {
        get().toast("info", "请先选择直播分区");
        return;
      }
      set({ busy: "starting" });
      try {
        if (!(await get().saveTitle())) return;
        const stream = await api.liveStart(room.room_id, areaId);
        set({ stream });
        await get().loadRoom();

        if (!get().autoPush) {
          get().toast("ok", "已开播。请把推流信息填入 OBS 开始推流");
        } else if (!get().obs.connected) {
          get().toast("info", "已开播，但 OBS 未连接。请手动复制推流信息，或连接 OBS 后点击「推送到 OBS」");
        } else {
          await get().pushToObs();
        }
      } catch (e) {
        const err = toAppError(e);
        if (err.kind === "face_auth" && err.qr) set({ faceAuthQr: err.qr });
        else fail(e, "开播失败：");
      } finally {
        set({ busy: null });
      }
    },

    pushToObs: async () => {
      const { stream } = get();
      if (!stream) return;
      try {
        await api.obsStartStream(stream.server, stream.key);
        get().toast("ok", "OBS 已开始推流");
        await get().pollObs();
      } catch (e) {
        fail(e, "推送到 OBS 失败：");
      }
    },

    endLive: async () => {
      const { room, busy } = get();
      if (!room || busy) return;
      set({ busy: "stopping" });
      try {
        // 先停 OBS 推流再关播；OBS 停不掉不应阻止关播。
        await api.obsStopStream().catch(() => {});
        await api.liveStop(room.room_id);
        set({ stream: null });
        get().toast("ok", "已下播");
        await get().loadRoom();
        await get().pollObs();
      } catch (e) {
        fail(e, "下播失败：");
      } finally {
        set({ busy: null });
      }
    },

    dismissFaceAuth: () => set({ faceAuthQr: null }),

    connectObs: async (config, silent = false) => {
      if (get().obsConnecting) return false;
      set({ obsConnecting: true, obsConfig: config });
      try {
        const obs = await api.obsConnect(config);
        lastSample = null;
        set({ obs, obsWanted: true });
        if (!silent) get().toast("ok", "已连接 OBS");
        return true;
      } catch (e) {
        if (!silent) fail(e);
        return false;
      } finally {
        set({ obsConnecting: false });
      }
    },

    disconnectObs: async () => {
      await api.obsDisconnect().catch(() => {});
      lastSample = null;
      set({ obs: OBS_OFFLINE, obsWanted: false, bitrateKbps: 0 });
    },

    pollObs: async () => {
      const { obs: prev, obsWanted, obsConfig, obsConnecting } = get();
      if (!prev.connected) {
        if (obsWanted && !obsConnecting) await get().connectObs(obsConfig, true);
        return;
      }
      const obs = await api.obsStatus().catch(() => OBS_OFFLINE);
      let bitrateKbps = 0;
      const now = performance.now();
      if (obs.streaming) {
        if (lastSample && obs.bytes >= lastSample.bytes && now > lastSample.at) {
          const bits = (obs.bytes - lastSample.bytes) * 8;
          bitrateKbps = Math.round(bits / (now - lastSample.at));
        } else {
          bitrateKbps = get().bitrateKbps;
        }
        lastSample = { bytes: obs.bytes, at: now };
      } else {
        lastSample = null;
      }
      if (prev.connected && !obs.connected) get().toast("info", "与 OBS 的连接已断开，将自动重连");
      set({ obs, bitrateKbps });
    },

    setAutoPush: (autoPush) => {
      localStorage.setItem(AUTO_PUSH_KEY, autoPush ? "1" : "0");
      set({ autoPush });
    },

    toast: (tone, text) => {
      const id = ++toastSeq;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, text }] }));
      setTimeout(() => get().dismissToast(id), tone === "error" ? 7000 : 4000);
    },

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  };
});
