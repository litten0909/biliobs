import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useApp } from "../store";

export function StreamPanel() {
  const stream = useApp((s) => s.stream);
  const isLive = useApp((s) => s.room?.is_live ?? false);
  const obs = useApp((s) => s.obs);
  const autoPush = useApp((s) => s.autoPush);
  const setAutoPush = useApp((s) => s.setAutoPush);
  const pushToObs = useApp((s) => s.pushToObs);
  const goLive = useApp((s) => s.goLive);
  const busy = useApp((s) => s.busy);
  const [pushing, setPushing] = useState(false);

  const push = async () => {
    setPushing(true);
    await pushToObs();
    setPushing(false);
  };

  return (
    <section
      className="animate-rise border-t border-line px-7 pt-7 pb-8"
      style={{ animationDelay: "120ms" }}
    >
      <h2 className="text-lg leading-[1.5] font-semibold">推流</h2>

      <label className="mt-4 flex cursor-pointer items-start justify-between gap-4">
        <span>
          <span className="block text-sm">开播后自动推流到 OBS</span>
          <span className="mt-0.5 block text-xs leading-[1.7] text-ink-3">
            开播成功后写入推流地址并开始推流
          </span>
        </span>
        <Switch checked={autoPush} onChange={setAutoPush} />
      </label>

      {stream ? (
        <div className="animate-fade mt-6 grid gap-4">
          <Secret label="服务器地址" value={stream.server} />
          <Secret label="推流码" value={stream.key} masked />
          {obs.connected && !obs.streaming && (
            <button className="btn btn-primary" disabled={pushing} onClick={() => void push()}>
              {pushing ? "推送中…" : "推送到 OBS 并开始推流"}
            </button>
          )}
          <p className="text-xs leading-[1.7] text-ink-3">
            推流码等同于直播间的钥匙，请不要截图或发给别人。
          </p>
        </div>
      ) : isLive ? (
        <div className="mt-6 rounded-lg border border-line bg-sunken/70 p-4">
          <p className="text-sm leading-[1.75] text-ink-2">
            直播间已在直播中，但不是由本次会话开播的，所以这里没有推流信息。
          </p>
          <button className="btn mt-3 w-full" disabled={busy !== null} onClick={() => void goLive()}>
            {busy === "starting" ? "获取中…" : "重新获取推流信息"}
          </button>
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-line-strong px-4 py-3.5 text-sm leading-[1.75] text-ink-3">
          开播后，这里会显示服务器地址和推流码。
        </p>
      )}
    </section>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-[22px] w-10 shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] size-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : ""
        }`}
      />
    </button>
  );
}

function Secret({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
  const toast = useApp((s) => s.toast);
  const [shown, setShown] = useState(!masked);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("error", "复制失败，请点击眼睛图标显示后手动复制");
    }
  };

  return (
    <div>
      <div className="mb-1.5 text-sm text-ink-2">{label}</div>
      <div className="flex h-[42px] items-center gap-0.5 rounded-lg border border-line bg-white pr-1 pl-3">
        <span
          className={`min-w-0 flex-1 truncate font-mono text-xs ${
            shown ? "text-ink select-text" : "tracking-[0.2em] text-ink-4"
          }`}
        >
          {shown ? value : "•".repeat(20)}
        </span>
        {masked && (
          <button
            className="icon-btn"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "隐藏" : "显示"}
          >
            {shown ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
        <button className="icon-btn" onClick={() => void copy()} aria-label={`复制${label}`}>
          {copied ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}
