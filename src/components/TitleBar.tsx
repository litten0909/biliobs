import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, LogOut } from "lucide-react";
import { useApp } from "../store";
import { openExternal } from "../lib/api";
import { Wordmark } from "./Wordmark";
import { Avatar } from "./Avatar";

const isMac = /Mac/i.test(navigator.userAgent);

export function TitleBar() {
  const user = useApp((s) => s.user);
  const room = useApp((s) => s.room);
  const logout = useApp((s) => s.logout);
  const phase = useApp((s) => s.phase);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <header
      data-tauri-drag-region
      className={`relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface pr-5 ${
        isMac ? "pl-[92px]" : "pl-6"
      }`}
    >
      {phase === "login" ? <span /> : <Wordmark />}

      {user && (
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 text-sm text-ink-2 transition hover:bg-sunken"
          >
            <Avatar src={user.face} name={user.name} size={30} />
            <span className="max-w-40 truncate">{user.name}</span>
            <ChevronDown
              size={14}
              className={`text-ink-4 transition ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div className="card animate-pop absolute top-11 right-0 w-56 p-1.5 shadow-[0_12px_32px_-12px_rgb(60_45_25/0.25)]">
              <div className="px-3 pt-2 pb-2.5 font-mono text-xs text-ink-3">UID {user.mid}</div>
              <div className="mx-1.5 mb-1.5 border-t border-line" />
              {room && (
                <MenuItem
                  icon={<ExternalLink size={15} />}
                  onClick={() => {
                    setOpen(false);
                    void openExternal(`https://live.bilibili.com/${room.room_id}`);
                  }}
                >
                  打开我的直播间
                </MenuItem>
              )}
              <MenuItem
                icon={<LogOut size={15} />}
                danger
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
              >
                退出登录
              </MenuItem>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

function MenuItem({
  icon,
  children,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm transition hover:bg-sunken ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
