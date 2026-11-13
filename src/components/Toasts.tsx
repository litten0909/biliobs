import { X } from "lucide-react";
import { useApp } from "../store";

const DOT = {
  ok: "bg-ok",
  error: "bg-danger",
  info: "bg-[#c9952f]",
} as const;

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[100px] z-[60] flex flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-pop pointer-events-auto flex max-w-[540px] items-start gap-3 rounded-lg border border-line bg-surface py-2.5 pr-2 pl-4 text-sm shadow-[0_14px_36px_-16px_rgb(60_45_25/0.35)]"
        >
          <i className={`mt-[9px] size-1.5 shrink-0 rounded-full ${DOT[t.tone]}`} />
          <span className="leading-[1.65]">{t.text}</span>
          <button className="icon-btn -my-1 size-7" onClick={() => dismiss(t.id)} aria-label="关闭">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
