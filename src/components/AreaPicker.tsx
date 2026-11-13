import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { useApp } from "../store";
import type { Area } from "../lib/api";

export function AreaPicker({ onClose }: { onClose: () => void }) {
  const areas = useApp((s) => s.areas);
  const areaId = useApp((s) => s.areaId);
  const setArea = useApp((s) => s.setArea);
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState(
    () => areas.find((g) => g.areas.some((a) => a.id === areaId))?.id ?? areas[0]?.id ?? 0,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 分区列表可能在弹窗打开后才加载完。
  useEffect(() => {
    if (!groupId && areas.length) setGroupId(areas[0].id);
  }, [areas, groupId]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q) {
      return areas.flatMap((g) =>
        g.areas
          .filter((a) => a.name.toLowerCase().includes(q))
          .map((a) => ({ area: a, groupName: g.name })),
      );
    }
    const group = areas.find((g) => g.id === groupId);
    return (group?.areas ?? []).map((a) => ({ area: a, groupName: "" }));
  }, [areas, groupId, q]);

  const choose = (area: Area) => {
    void setArea(area.id);
    onClose();
  };

  return (
    <div
      className="animate-fade fixed inset-0 z-50 grid place-items-center bg-[#3a3328]/35"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="选择直播分区"
        className="animate-pop flex h-[540px] w-[760px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_30px_70px_-30px_rgb(60_45_25/0.45)]"
      >
        <div className="flex items-start justify-between px-7 pt-6">
          <h2 className="text-2xl leading-[1.45] font-semibold">选择直播分区</h2>
          <button className="icon-btn -mr-2" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>

        <div className="relative mx-7 mt-4 mb-5">
          <Search size={16} className="absolute top-[13px] left-3.5 text-ink-4" />
          <input
            autoFocus
            className="field pl-10"
            placeholder="搜索分区，例如：英雄联盟"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex min-h-0 flex-1 border-t border-line">
          {!q && (
            <nav className="w-40 shrink-0 overflow-y-auto border-r border-line bg-sunken/60 p-2.5">
              {areas.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGroupId(g.id)}
                  className={`mb-0.5 flex h-10 w-full items-center rounded-md px-3 text-left text-sm transition ${
                    g.id === groupId
                      ? "bg-accent-soft font-semibold text-accent-ink"
                      : "text-ink-2 hover:bg-sunken"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </nav>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {areas.length === 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="skeleton h-[54px]" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-ink-3">
                没有找到「{query.trim()}」相关的分区
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {results.map(({ area, groupName }) => {
                  const active = area.id === areaId;
                  return (
                    <button
                      key={area.id}
                      onClick={() => choose(area)}
                      className={`flex h-[54px] items-center gap-3 rounded-lg border px-3 text-left transition ${
                        active
                          ? "border-accent bg-accent-soft/60"
                          : "border-transparent hover:border-line hover:bg-sunken/70"
                      }`}
                    >
                      <AreaIcon area={area} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm leading-[1.4]">{area.name}</span>
                        {groupName && (
                          <span className="block truncate text-xs text-ink-3">{groupName}</span>
                        )}
                      </span>
                      {active && <Check size={16} className="shrink-0 text-accent-ink" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AreaIcon({ area }: { area: Area }) {
  const [broken, setBroken] = useState(false);
  if (!area.pic || broken) {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#ece5da] text-xs font-medium text-[#6d6252]">
        {area.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={area.pic}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setBroken(true)}
      className="size-8 shrink-0 rounded-md object-cover"
    />
  );
}
