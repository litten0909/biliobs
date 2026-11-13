// 浏览器预览用的模拟后端：`pnpm dev` 后直接打开 http://localhost:1420 即可调界面。
// 通过 URL 参数切换场景：?mock=login | home（默认）| live | noobs
import type { AreaGroup, ObsStatus, Room, User } from "./api";

const scenario = new URLSearchParams(location.search).get("mock") ?? "home";

// 截图用：加上 &still 关闭所有动画，避免无头浏览器截到动画的第一帧。
if (new URLSearchParams(location.search).has("still")) {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
  document.head.append(style);
}

const user: User = { mid: 123456, name: "示例用户", face: "" };

const room: Room = {
  room_id: 123456,
  title: "直播标题示例",
  cover: "",
  is_live: scenario === "live",
  area_id: 236,
  area_name: "主机游戏",
  parent_area_id: 6,
  parent_area_name: "单机游戏",
};

const areas: AreaGroup[] = [
  ["网游", ["英雄联盟", "无畏契约", "三角洲行动", "永劫无间", "CS2", "DOTA2", "守望先锋", "穿越火线"]],
  ["手游", ["王者荣耀", "和平精英", "原神", "崩坏：星穹铁道", "明日方舟", "第五人格", "蛋仔派对"]],
  ["单机游戏", ["主机游戏", "独立游戏", "我的世界", "黑神话：悟空", "艾尔登法环", "怀旧游戏", "恐怖游戏"]],
  ["娱乐", ["聊天室", "视频唱见", "舞见", "户外", "日常"]],
  ["虚拟主播", ["虚拟日常", "虚拟Gamer", "虚拟Singer", "TopStar"]],
  ["知识", ["编程", "校园学习", "职场·技能", "人文社科", "科技科普"]],
].map(([name, list], gi) => ({
  id: gi + 1,
  name: name as string,
  areas: (list as string[]).map((n, i) => ({ id: gi * 100 + i + 200, name: n, pic: "" })),
}));
areas[2].areas[0].id = 236;

let loggedIn = scenario !== "login";
let obsConnected = scenario !== "noobs" && scenario !== "login";
let streamingSince: number | null = scenario === "live" ? Date.now() - 754_000 : null;
let polls = 0;
let news = "这里是直播公告示例。";
let connectAttempts = 0;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function obsStatus(): ObsStatus {
  const ms = streamingSince ? Date.now() - streamingSince : 0;
  return {
    connected: obsConnected,
    streaming: obsConnected && streamingSince !== null,
    reconnecting: false,
    duration_ms: ms,
    bytes: Math.floor((ms / 1000) * 750_000 + Math.random() * 40_000),
    skipped_frames: streamingSince ? 3 : 0,
    total_frames: Math.floor((ms / 1000) * 60),
  };
}

export async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await wait(250 + Math.random() * 250);
  const result = ((): unknown => {
    switch (cmd) {
      case "auth_restore":
        return loggedIn ? user : null;
      case "auth_qr_generate":
        polls = 0;
        return { url: "https://example.com/biliobs-mock-qr", key: "mock" };
      case "auth_qr_poll":
        polls += 1;
        if (polls < 4) return { status: "waiting" };
        if (polls < 7) return { status: "scanned" };
        loggedIn = true;
        obsConnected = true;
        return { status: "success", user };
      case "auth_logout":
        loggedIn = false;
        return null;
      case "room_get":
        return { ...room };
      case "areas_list":
        return areas;
      case "areas_recent":
        return [236, 201, 300, 102, 400];
      case "room_update_title":
        room.title = String(args?.title ?? "");
        return null;
      case "live_start": {
        room.is_live = true;
        const id = Number(args?.areaId);
        for (const g of areas) {
          const a = g.areas.find((x) => x.id === id);
          if (a) Object.assign(room, { area_id: a.id, area_name: a.name, parent_area_name: g.name });
        }
        return {
          server: "rtmp://example.invalid/live/",
          key: "?streamname=live_123456_example&key=EXAMPLE_STREAM_KEY&schedule=rtmp&pflag=1",
        };
      }
      case "room_change_area": {
        const id = Number(args?.areaId);
        for (const g of areas) {
          const a = g.areas.find((x) => x.id === id);
          if (a) Object.assign(room, { area_id: a.id, area_name: a.name, parent_area_name: g.name });
        }
        return null;
      }
      case "room_news_get":
        return news;
      case "room_news_update":
        news = String(args?.content ?? "");
        return null;
      case "room_cover_update":
        return "";
      case "live_face_auth_done":
        return false;
      case "live_stop":
        room.is_live = false;
        streamingSince = null;
        return null;
      case "obs_config_get":
        return { host: "127.0.0.1", port: 4455, password: "" };
      case "obs_connect":
        // noobs 场景：启动时的自动连接失败，手动点击连接才成功。
        if (scenario === "noobs" && connectAttempts++ === 0) {
          throw { kind: "obs", message: "连接不上 OBS。请确认 OBS 已打开" };
        }
        obsConnected = true;
        return obsStatus();
      case "obs_disconnect":
        obsConnected = false;
        return null;
      case "obs_status":
        return obsStatus();
      case "obs_start_stream":
        streamingSince = Date.now();
        return null;
      case "obs_stop_stream":
        streamingSince = null;
        return null;
      default:
        throw { kind: "other", message: `未模拟的命令：${cmd}` };
    }
  })();
  return result as T;
}
