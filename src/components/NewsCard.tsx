import { useEffect, useState } from "react";
import { useApp } from "../store";

/** 直播公告：显示在直播间简介区，改动后需要手动保存。 */
export function NewsCard() {
  const news = useApp((s) => s.news);
  const saveNews = useApp((s) => s.saveNews);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // 公告加载或保存成功后，用最新内容重置草稿。
  useEffect(() => {
    if (news !== null) setDraft(news);
  }, [news]);

  const loading = news === null;
  const dirty = !loading && draft.trim() !== news;

  const save = async () => {
    setSaving(true);
    await saveNews(draft);
    setSaving(false);
  };

  return (
    <div className="card mt-5">
      <div className="flex h-12 items-center justify-between pr-3.5 pl-5">
        <span className="text-sm text-ink-3">直播公告</span>
        {dirty && (
          <div className="animate-fade flex items-center gap-1">
            <button
              className="h-8 rounded-md px-2 text-sm text-ink-3 transition hover:bg-sunken hover:text-ink"
              disabled={saving}
              onClick={() => setDraft(news ?? "")}
            >
              撤销
            </button>
            <button
              className="h-8 rounded-md px-2 text-sm font-medium text-accent-ink transition hover:bg-accent-soft/70 disabled:opacity-50"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "保存中…" : "保存公告"}
            </button>
          </div>
        )}
      </div>
      <textarea
        aria-label="直播公告"
        rows={2}
        disabled={loading}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={loading ? "正在加载…" : "还没有公告。写点什么告诉观众开播时间、直播内容或注意事项"}
        className="block w-full resize-none border-0 bg-transparent px-5 pb-4 text-base leading-[1.7] text-ink outline-none select-text placeholder:text-ink-4"
      />
    </div>
  );
}
