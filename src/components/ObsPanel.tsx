import { useEffect, useState } from "react";
import { Loader2, Settings2, Unplug } from "lucide-react";
import { useApp } from "../store";
import { formatBitrate, formatDuration } from "../lib/format";

export function ObsPanel() {
  const obs = useApp((s) => s.obs);
  const config = useApp((s) => s.obsConfig);
  const connecting = useApp((s) => s.obsConnecting);
  const wanted = useApp((s) => s.obsWanted);
  const bitrate = useApp((s) => s.bitrateKbps);
  const connectObs = useApp((s) => s.connectObs);
  const disconnectObs = useApp((s) => s.disconnectObs);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);

  const showForm = !obs.connected || editing;
  const dropped =
    obs.total_frames > 0 ? ((obs.skipped_frames / obs.total_frames) * 100).toFixed(1) : "0.0";

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (await connectObs({ ...draft, host: draft.host.trim() || "127.0.0.1" })) setEditing(false);
  };

  const status = obs.connected
    ? obs.streaming
      ? obs.reconnecting
        ? { text: "推流重连中", tone: "warn" }
        : { text: "推流中", tone: "accent" }
      : { text: "已连接", tone: "ok" }
    : connecting
      ? { text: "连接中", tone: "warn" }
      : wanted
        ? { text: "已断开，正在重连", tone: "warn" }
        : { text: "未连接", tone: "idle" };

  const tone = {
    ok: "bg-ok-soft text-ok",
    accent: "bg-accent-soft text-accent-ink",
    warn: "bg-warn-soft text-warn",
    idle: "bg-sunken text-ink-2",
  }[status.tone]!;

  return (
    <section className="animate-rise px-7 pt-8 pb-7" style={{ animationDelay: "60ms" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-2xl leading-[1.4] font-semibold tracking-[-0.03em]">
            OBS Studio
          </h2>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>{status.text}</span>
        </div>
        {obs.connected && (
          <div className="-mr-2 flex">
            <button
              className="icon-btn"
              onClick={() => setEditing((v) => !v)}
              aria-label="连接设置"
              title="连接设置"
            >
              <Settings2 size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => void disconnectObs()}
              aria-label="断开连接"
              title="断开连接"
            >
              <Unplug size={16} />
            </button>
          </div>
        )}
      </div>

      {obs.streaming && !editing && (
        <dl className="mt-6 grid grid-cols-3 divide-x divide-line border-y border-line">
          <Stat label="时长" value={formatDuration(obs.duration_ms)} />
          <Stat label="码率" value={formatBitrate(bitrate)} />
          <Stat label="丢帧" value={`${dropped}%`} warn={Number(dropped) >= 1} />
        </dl>
      )}

      {obs.connected && !obs.streaming && !editing && (
        <p className="mt-3 text-sm leading-[1.75] text-ink-3">
          {config.host}:{config.port} · 推流开始后这里会显示时长、码率和丢帧
        </p>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-5 grid gap-4">
          {!obs.connected && (
            <p className="text-sm leading-[1.75] text-ink-2">
              在 OBS 菜单「工具 → WebSocket 服务器设置」里开启服务器，再把端口和密码填到下面。
            </p>
          )}
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Field label="地址">
              <input
                className="field font-mono text-[13px]"
                value={draft.host}
                onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                placeholder="127.0.0.1"
              />
            </Field>
            <Field label="端口">
              <input
                className="field font-mono text-[13px]"
                inputMode="numeric"
                value={draft.port || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    port: Math.min(65535, Number(e.target.value.replace(/\D/g, ""))),
                  })
                }
                placeholder="4455"
              />
            </Field>
          </div>
          <Field label="密码" hint="未启用身份验证可留空">
            <input
              className="field font-mono text-[13px]"
              type="password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              autoComplete="off"
            />
          </Field>
          <button className="btn btn-primary mt-1" type="submit" disabled={connecting || !draft.port}>
            {connecting && <Loader2 size={15} className="animate-spin" />}
            {connecting ? "连接中…" : obs.connected ? "重新连接" : "连接 OBS"}
          </button>
        </form>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between text-sm text-ink-2">
        {label}
        {hint && <span className="text-xs text-ink-4">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="py-4 pl-4 first:pl-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd
        className={`mt-1 font-mono text-lg leading-[1.4] tracking-[-0.03em] whitespace-nowrap ${
          warn ? "text-warn" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
