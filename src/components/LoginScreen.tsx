import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, RefreshCw } from "lucide-react";
import { api, toAppError } from "../lib/api";
import { useApp } from "../store";

type Stage = "loading" | "waiting" | "scanned" | "expired" | "error";

export function LoginScreen() {
  const onLoggedIn = useApp((s) => s.onLoggedIn);
  const [stage, setStage] = useState<Stage>("loading");
  const [qr, setQr] = useState<{ url: string; key: string } | null>(null);
  const [error, setError] = useState("");
  // 每次刷新二维码递增，用来让旧的轮询自行退出。
  const round = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++round.current;
    setStage("loading");
    try {
      const code = await api.authQrGenerate();
      if (current !== round.current) return;
      setQr(code);
      setStage("waiting");
    } catch (e) {
      if (current !== round.current) return;
      setError(toAppError(e).message);
      setStage("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      round.current++;
    };
  }, [refresh]);

  useEffect(() => {
    if (!qr || (stage !== "waiting" && stage !== "scanned")) return;
    const current = round.current;
    const timer = setInterval(async () => {
      try {
        const res = await api.authQrPoll(qr.key);
        if (current !== round.current) return;
        if (res.status === "success") {
          round.current++;
          await onLoggedIn(res.user);
        } else {
          setStage(res.status);
        }
      } catch {
        // 单次轮询失败（多为网络抖动）不打断流程，下一轮继续。
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [qr, stage, onLoggedIn]);

  const dimmed = stage !== "waiting";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-14 pt-9 pb-10">
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto] items-center gap-16">
        <section className="animate-rise">
          <div className="eyebrow">非官方工具</div>
          <h1 className="mt-3 font-mono text-[104px] leading-[1.08] font-bold tracking-[-0.04em] text-ink">
            BiliOBS
          </h1>
          <h2 className="mt-5 text-[30px] leading-[1.45] font-medium tracking-[-0.01em]">
            在 OBS 里一键开播。
            <br />
            <span className="text-ink-3">不用再复制推流码。</span>
          </h2>
          <p className="mt-5 max-w-[26em] text-base leading-[1.8] text-ink-2">
            扫码登录，选好分区和标题，点一下开播。
            <br />
            推流地址会自动写入 OBS 并开始推流。
          </p>
        </section>

        <section className="animate-rise w-[324px]" style={{ animationDelay: "80ms" }}>
          <div className="card p-7">
            <div className="text-sm font-medium text-ink-2">扫码登录</div>

            <div className="relative mx-auto mt-5 size-[216px] rounded-lg border border-line bg-white p-3">
              {qr ? (
                <QRCodeSVG
                  value={qr.url}
                  size={190}
                  level="M"
                  fgColor="#292824"
                  className={`transition duration-300 ${dimmed ? "opacity-[0.07]" : ""}`}
                />
              ) : (
                <div className="skeleton size-full" />
              )}

              {stage === "scanned" && (
                <Overlay>
                  <span className="grid size-11 place-items-center rounded-full bg-ok text-white">
                    <Check size={22} strokeWidth={2.5} />
                  </span>
                  <span className="mt-3 font-medium">扫码成功</span>
                </Overlay>
              )}
              {(stage === "expired" || stage === "error") && (
                <Overlay>
                  <button
                    onClick={() => void refresh()}
                    className="grid size-11 place-items-center rounded-full bg-ink text-white transition hover:bg-accent-deep"
                    aria-label="刷新二维码"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <span className="mt-3 font-medium">
                    {stage === "expired" ? "二维码已过期" : "加载失败"}
                  </span>
                </Overlay>
              )}
            </div>

            <p className="mt-5 min-h-[46px] text-center text-sm leading-[1.65] text-ink-2">
              {stage === "loading" && "正在获取二维码…"}
              {stage === "waiting" && (
                <>
                  打开哔哩哔哩 App
                  <br />
                  使用右上角的「扫一扫」
                </>
              )}
              {stage === "scanned" && "请在手机上确认登录"}
              {stage === "expired" && "点击上方按钮刷新二维码"}
              {stage === "error" && <span className="text-danger">{error}</span>}
            </p>
          </div>

          <p className="mt-4 px-1 text-xs leading-[1.7] text-ink-3">
            不经手你的密码。登录凭据只保存在本机的系统钥匙串里。
          </p>
        </section>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-pop absolute inset-0 flex flex-col items-center justify-center text-sm">
      {children}
    </div>
  );
}
