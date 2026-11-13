import { useState } from "react";
import { ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { useApp } from "../store";
import { openExternal, type Area } from "../lib/api";
import { AreaPicker } from "./AreaPicker";
import { CoverCard } from "./CoverCard";
import { NewsCard } from "./NewsCard";

const TITLE_MAX = 40;

export function Stage() {
  const room = useApp((s) => s.room);
  const roomError = useApp((s) => s.roomError);
  const loadRoom = useApp((s) => s.loadRoom);

  if (roomError) {
    const noRoom = roomError.kind === "no_room";
    return (
      <section className="animate-rise flex min-w-0 flex-1 flex-col justify-center px-12">
        <h1 className="text-[30px] leading-[1.35] font-semibold tracking-[-0.01em]">
          {noRoom ? "还没有开通直播间" : "直播间信息加载失败"}
        </h1>
        <p className="mt-3 max-w-[30em] text-base leading-[1.8] text-ink-2">
          {noRoom
            ? "需要先在 B站直播中心开通直播间（需要实名认证），开通后回到这里重新加载。"
            : roomError.message}
        </p>
        <div className="mt-7 flex gap-3">
          {noRoom && (
            <button
              className="btn btn-primary"
              onClick={() => void openExternal("https://link.bilibili.com/p/center/index")}
            >
              <ExternalLink size={15} />
              前往直播中心
            </button>
          )}
          <button className="btn" onClick={() => void loadRoom()}>
            <RefreshCw size={15} />
            重新加载
          </button>
        </div>
      </section>
    );
  }

  if (!room) {
    return (
      <section className="min-w-0 flex-1 px-12 pt-10">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-5 h-11 w-4/5" />
        <div className="skeleton mt-10 h-24 w-full" />
      </section>
    );
  }

  return <StageContent />;
}

function StageContent() {
  const room = useApp((s) => s.room)!;
  const areas = useApp((s) => s.areas);
  const areaId = useApp((s) => s.areaId);
  const titleDraft = useApp((s) => s.titleDraft);
  const setTitleDraft = useApp((s) => s.setTitleDraft);
  const saveTitle = useApp((s) => s.saveTitle);
  const [picking, setPicking] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);

  const group = areas.find((g) => g.areas.some((a) => a.id === areaId));
  const area = group?.areas.find((a) => a.id === areaId);
  // 分区列表还没加载回来时，先用直播间自带的分区名兜底。
  const areaName = area?.name ?? (areaId === room.area_id ? room.area_name : "");
  const groupName = group?.name ?? (areaId === room.area_id ? room.parent_area_name : "");

  const titleDirty = titleDraft.trim() !== room.title && titleDraft.trim() !== "";
  const live = room.is_live;

  const commitTitle = async () => {
    if (!titleDirty || savingTitle) return;
    setSavingTitle(true);
    await saveTitle();
    setSavingTitle(false);
  };

  return (
    <section className="animate-rise min-w-0 flex-1 overflow-y-auto px-12 pt-8 pb-6">
      <div className="flex items-center justify-between">
        <div className="eyebrow flex items-center gap-2.5">
          <i
            className={`size-1.5 rounded-full ${live ? "animate-pulse-dot bg-accent" : "bg-ink-4"}`}
          />
          房间号
          <span className="select-text">{room.room_id}</span>
        </div>
        <StatusPill live={live} />
      </div>

      {/* 标题直接作为页面大标题来编辑 */}
      <div className="mt-4">
        <input
          aria-label="直播标题"
          className="w-full border-0 border-b border-transparent bg-transparent pb-2 text-[32px] leading-[1.35] font-semibold tracking-[-0.015em] text-ink transition-colors outline-none placeholder:text-ink-4 hover:border-line focus:border-accent"
          value={titleDraft}
          maxLength={TITLE_MAX}
          placeholder="给这场直播起个标题"
          onChange={(e) => setTitleDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void commitTitle();
          }}
        />
        <div className="mt-2 flex h-7 items-center justify-between text-sm text-ink-3">
          <span>
            {titleDirty ? (
              <button
                className="animate-fade font-medium text-accent-ink underline-offset-4 hover:underline disabled:opacity-50"
                disabled={savingTitle}
                onClick={() => void commitTitle()}
              >
                {savingTitle ? "保存中…" : "保存标题"}
                {!savingTitle && <span className="ml-2 font-mono text-xs text-ink-4">↵</span>}
              </button>
            ) : (
              "点击标题即可修改，开播时会自动保存"
            )}
          </span>
          <span
            className={`font-mono text-xs ${
              titleDraft.length >= TITLE_MAX ? "text-warn" : "text-ink-4"
            }`}
          >
            {titleDraft.length} / {TITLE_MAX}
          </span>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-5">
        <AreaCard
          area={area}
          areaName={areaName}
          groupName={groupName}
          live={live}
          onPick={() => setPicking(true)}
        />

        <CoverCard />
      </div>

      <NewsCard />

      {picking && <AreaPicker onClose={() => setPicking(false)} />}
    </section>
  );
}

function AreaCard({
  area,
  areaName,
  groupName,
  live,
  onPick,
}: {
  area: Area | undefined;
  areaName: string;
  groupName: string;
  live: boolean;
  onPick: () => void;
}) {
  const areas = useApp((s) => s.areas);
  const areaId = useApp((s) => s.areaId);
  const recentIds = useApp((s) => s.recentAreaIds);
  const setArea = useApp((s) => s.setArea);

  // 最近使用过、且不是当前选中的分区，最多列 4 个。
  const all = areas.flatMap((g) => g.areas);
  const recents = recentIds
    .filter((id) => id !== areaId)
    .map((id) => all.find((a) => a.id === id))
    .filter((a): a is Area => Boolean(a))
    .slice(0, 4);

  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="text-sm text-ink-3">直播分区</span>
        <button
          onClick={onPick}
          className="-mr-1.5 flex h-8 items-center gap-0.5 rounded-md px-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-soft/70"
        >
          {areaName ? "更换" : "选择"}
          <ChevronRight size={15} />
        </button>
      </div>

      <button
        onClick={onPick}
        className="flex flex-1 items-center gap-4 px-5 py-4 text-left"
      >
        <AreaThumb area={area} name={areaName} />
        <span className="min-w-0">
          <span
            className={`block truncate text-2xl leading-[1.4] font-medium ${
              areaName ? "" : "text-ink-4"
            }`}
          >
            {areaName || "尚未选择"}
          </span>
          <span className="block truncate text-sm text-ink-3">
            {groupName || "开播前需要先选择一个分区"}
          </span>
        </span>
      </button>

      <div className="flex h-[52px] items-center border-t border-line px-5">
        {recents.length > 0 ? (
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            <span className="shrink-0 text-xs text-ink-3">最近使用</span>
            {recents.map((a) => (
              <button
                key={a.id}
                onClick={() => void setArea(a.id)}
                className="h-7 shrink-0 rounded-md border border-line bg-white px-2.5 text-xs text-ink-2 transition hover:border-accent hover:text-accent-ink"
              >
                {a.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-7 text-ink-3">
            {live ? "直播中更换分区会立即生效" : "分区决定直播间出现在哪个频道下"}
          </p>
        )}
      </div>
    </div>
  );
}

function AreaThumb({ area, name }: { area: Area | undefined; name: string }) {
  const [brokenSrc, setBrokenSrc] = useState("");
  if (area?.pic && brokenSrc !== area.pic) {
    return (
      <img
        src={area.pic}
        alt=""
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setBrokenSrc(area.pic)}
        className="size-14 shrink-0 rounded-xl border border-line object-cover"
      />
    );
  }
  return (
    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#ece5da] text-xl font-medium text-[#6d6252]">
      {name.slice(0, 1) || "?"}
    </span>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return live ? (
    <span className="flex items-center gap-1.5 rounded-md bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink">
      <i className="animate-pulse-dot size-1.5 rounded-full bg-accent" />
      直播中
    </span>
  ) : (
    <span className="rounded-md bg-sunken px-2.5 py-1 text-xs text-ink-2">未开播</span>
  );
}
