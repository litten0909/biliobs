import { useState } from "react";

/** 头像；图片缺失或加载失败时退回到昵称首字。 */
export function Avatar({ src, name, size }: { src: string; name: string; size: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (!src || broken) {
    return (
      <span
        style={{ ...style, fontSize: size * 0.4 }}
        className="grid shrink-0 place-items-center rounded-full bg-[#ece5da] font-medium text-[#6d6252]"
      >
        {name.slice(0, 1) || "?"}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setBroken(true)}
      style={style}
      className="shrink-0 rounded-full border border-line object-cover"
    />
  );
}
