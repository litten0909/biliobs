/** 品牌标：取景框加直播指示点（与应用图标同一图形），后接等宽字的 BiliOBS。 */
export function Wordmark() {
  return (
    <span className="pointer-events-none inline-flex items-center gap-2.5">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent" aria-hidden>
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8" />
          <path d="M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8" />
          <path d="M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16" />
          <path d="M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
        </g>
        <circle cx="12" cy="12" r="3.6" fill="currentColor" />
      </svg>
      <span className="font-mono text-[21px] leading-none font-semibold tracking-[-0.06em] text-ink">
        BiliOBS
      </span>
    </span>
  );
}
