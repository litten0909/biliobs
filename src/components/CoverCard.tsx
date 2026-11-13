import { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { useApp } from "../store";
import { prepareCover, type PreparedCover } from "../lib/image";

/** 封面卡片：展示当前封面，选图后先预览裁剪结果，确认才上传。 */
export function CoverCard() {
  const cover = useApp((s) => s.room?.cover ?? "");
  const updateCover = useApp((s) => s.updateCover);
  const toast = useApp((s) => s.toast);

  const inputRef = useRef<HTMLInputElement>(null);
  const [brokenSrc, setBrokenSrc] = useState("");
  const [pending, setPending] = useState<PreparedCover | null>(null);
  const [uploading, setUploading] = useState(false);

  const hasCover = cover !== "" && brokenSrc !== cover;

  const close = () => {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !uploading && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许再次选择同一个文件
    if (!file) return;
    try {
      setPending(await prepareCover(file));
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "图片处理失败");
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setUploading(true);
    const ok = await updateCover(pending.bytes);
    setUploading(false);
    if (ok) close();
  };

  return (
    <div className="card overflow-hidden">
      <div className="aspect-video w-full">
        {hasCover ? (
          <img
            src={cover}
            alt="直播间封面"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setBrokenSrc(cover)}
            className="size-full object-cover"
          />
        ) : (
          <div className="dot-grid grid size-full place-items-center text-ink-3">
            <ImageOff size={20} strokeWidth={1.6} />
          </div>
        )}
      </div>

      <div className="flex h-[52px] items-center justify-between border-t border-line pr-3.5 pl-5">
        <span className="text-sm text-ink-3">{hasCover ? "直播封面" : "暂无封面"}</span>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex h-8 items-center rounded-md px-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-soft/70"
        >
          {hasCover ? "更换封面" : "上传封面"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onFile(e)}
        />
      </div>

      {pending && (
        <div
          className="animate-fade fixed inset-0 z-50 grid place-items-center bg-[#3a3328]/35"
          onMouseDown={(e) => e.target === e.currentTarget && !uploading && close()}
        >
          <div
            role="dialog"
            aria-label="确认封面"
            className="animate-pop w-[600px] max-w-[92vw] rounded-xl border border-line bg-surface p-8 shadow-[0_30px_70px_-30px_rgb(60_45_25/0.45)]"
          >
            <h2 className="text-2xl leading-[1.45] font-semibold">使用这张封面？</h2>
            <p className="mt-1 text-sm leading-[1.75] text-ink-2">
              已按 16:9 居中裁剪。提交后需要 B站审核，通过后才会在直播间显示。
            </p>

            <img
              src={pending.previewUrl}
              alt="封面预览"
              draggable={false}
              className="mt-5 aspect-video w-full rounded-lg border border-line object-cover"
            />
            <div className="mt-2 font-mono text-xs text-ink-3">
              {pending.width} × {pending.height} · {Math.round(pending.bytes.length / 1024)} KB
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-line pt-5">
              <button className="btn" disabled={uploading} onClick={close}>
                取消
              </button>
              <button className="btn btn-primary" disabled={uploading} onClick={() => void confirm()}>
                {uploading && <Loader2 size={15} className="animate-spin" />}
                {uploading ? "上传中…" : "确认上传"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
