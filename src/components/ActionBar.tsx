import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, Square } from "lucide-react";
import { useApp } from "../store";
import { formatDuration } from "../lib/format";

export function ActionBar() {
  const room = useApp((s) => s.room);
  const obs = useApp((s) => s.obs);
  const busy = useApp((s) => s.busy);
  const areaId = useApp((s) => s.areaId);
  const autoPush = useApp((s) => s.autoPush);
  const goLive = useApp((s) => s.goLive);
  const endLive = useApp((s) => s.endLive);

  // 下播需要二次确认：第一次点击后按钮进入确认态，3 秒内再点才真正下播。
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const isLive = room?.is_live ?? false;
  const onAir = isLive && obs.streaming;

  let title: string;
  let detail: string;
  if (!room) {
    title = "";
    detail = "";
  } else if (onAir) {
    title = "正在直播";
    detail = "OBS 推流正常，观众可以看到画面";
  } else if (isLive) {
    title = "已开播，但 OBS 还没有推流";
    detail = "观众现在看到的是黑屏，请在右侧推送到 OBS 或手动开始推流";
  } else if (!areaId) {
    title = "还差一步";
    detail = "选好直播分区后就可以开播了";
  } else if (!obs.connected) {
    title = "OBS 还没有连接";
    detail = "在右侧连接 OBS 后，开播会自动推流；现在直接开播则需要手动复制推流信息";
  } else if (!autoPush) {
    title = "准备就绪";
    detail = "自动推流已关闭，开播后需要手动开始推流";
  } else {
    title = "准备就绪";
    detail = "开播后 OBS 会自动开始推流";
  }

  const warn = room !== null && (isLive ? !obs.streaming : areaId !== 0 && !obs.connected);

  return (
    <footer className="flex h-[84px] shrink-0 items-center justify-between gap-8 border-t border-line bg-surface px-12">
      <div className="flex min-w-0 items-center gap-5">
        {onAir && (
          <span className="font-mono text-2xl tracking-[-0.03em] text-accent-ink">
            {formatDuration(obs.duration_ms)}
          </span>
        )}
        <div className="min-w-0">
          <div className={`truncate text-base font-medium ${warn ? "text-warn" : ""}`}>{title}</div>
          <div className="truncate text-sm text-ink-3">{detail}</div>
        </div>
      </div>

      {isLive ? (
        <button
          disabled={busy !== null}
          onClick={() => {
            if (confirming) {
              setConfirming(false);
              void endLive();
            } else {
              setConfirming(true);
            }
          }}
          className={`flex h-[52px] shrink-0 items-center gap-3 rounded-full border px-7 text-base font-medium transition disabled:opacity-60 ${
            confirming
              ? "border-danger bg-danger text-white"
              : "border-line-strong bg-surface text-ink hover:border-danger hover:text-danger"
          }`}
        >
          {busy === "stopping" ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Square size={13} fill="currentColor" />
          )}
          {busy === "stopping" ? "正在下播…" : confirming ? "再点一次确认下播" : "结束直播"}
        </button>
      ) : (
        <button
          disabled={!room || busy !== null || !areaId}
          onClick={() => void goLive()}
          className="cta shrink-0"
        >
          {busy === "starting" ? "正在开播…" : "开始直播"}
          <span>
            {busy === "starting" ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <ArrowUpRight size={18} />
            )}
          </span>
        </button>
      )}
    </footer>
  );
}
