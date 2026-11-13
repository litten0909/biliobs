import { useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useApp } from "../store";
import { api, openExternal } from "../lib/api";

const POLL_MS = 3000;

/**
 * B站要求人脸认证时弹出。弹窗打开期间轮询认证状态，
 * 手机上认证完成后自动关闭并继续开播，不需要再回来点按钮。
 */
export function FaceAuthDialog() {
  const qr = useApp((s) => s.faceAuthQr);
  const roomId = useApp((s) => s.room?.room_id);
  const dismiss = useApp((s) => s.dismissFaceAuth);
  const goLive = useApp((s) => s.goLive);

  useEffect(() => {
    if (!qr || !roomId) return;
    let stopped = false;
    const timer = setInterval(async () => {
      // 查询失败（网络抖动等）不打断，下一轮继续。
      const done = await api.liveFaceAuthDone(roomId).catch(() => false);
      if (done && !stopped) {
        stopped = true;
        clearInterval(timer);
        dismiss();
        void goLive();
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [qr, roomId, dismiss, goLive]);

  if (!qr) return null;

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center bg-[#3a3328]/35">
      <div
        role="dialog"
        aria-label="人脸认证"
        className="animate-pop w-[560px] rounded-xl border border-line bg-surface p-8 shadow-[0_30px_70px_-30px_rgb(60_45_25/0.45)]"
      >
        <h2 className="text-2xl leading-[1.45] font-semibold">开播前需要人脸认证</h2>

        <div className="mt-6 flex items-center gap-7">
          <div className="shrink-0 rounded-lg border border-line bg-white p-3">
            <QRCodeSVG value={qr} size={156} level="M" fgColor="#292824" />
          </div>
          <div>
            <p className="text-base leading-[1.8] text-ink-2">
              这是 B站的要求。请用哔哩哔哩 App 扫描二维码，在手机上按提示完成认证。
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-3">
              <Loader2 size={14} className="animate-spin" />
              正在等待认证完成，完成后会自动开播
            </p>
            <button
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent-ink underline-offset-4 hover:underline"
              onClick={() => void openExternal(qr)}
            >
              <ExternalLink size={14} />
              扫不了？在浏览器中打开
            </button>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
          <button
            className="text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            onClick={() => {
              dismiss();
              void goLive();
            }}
          >
            已完成但没有自动继续？手动重试
          </button>
          <button className="btn" onClick={dismiss}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
