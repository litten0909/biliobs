import { useEffect } from "react";
import { useApp } from "./store";
import { TitleBar } from "./components/TitleBar";
import { LoginScreen } from "./components/LoginScreen";
import { Stage } from "./components/Stage";
import { ObsPanel } from "./components/ObsPanel";
import { StreamPanel } from "./components/StreamPanel";
import { ActionBar } from "./components/ActionBar";
import { FaceAuthDialog } from "./components/FaceAuthDialog";
import { Toasts } from "./components/Toasts";

export default function App() {
  const phase = useApp((s) => s.phase);
  const boot = useApp((s) => s.boot);
  const pollObs = useApp((s) => s.pollObs);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const timer = setInterval(() => void pollObs(), 2000);
    return () => clearInterval(timer);
  }, [pollObs]);

  return (
    <div className="flex h-full flex-col bg-paper">
      <TitleBar />

      {phase === "booting" && (
        <div className="grid flex-1 place-items-center">
          <span className="animate-fade text-sm text-ink-3">正在启动…</span>
        </div>
      )}

      {phase === "login" && <LoginScreen />}

      {phase === "ready" && (
        <>
          <main className="flex min-h-0 flex-1">
            <Stage />
            <aside className="w-[372px] shrink-0 overflow-y-auto border-l border-line bg-surface">
              <ObsPanel />
              <StreamPanel />
            </aside>
          </main>
          <ActionBar />
        </>
      )}

      <FaceAuthDialog />
      <Toasts />
    </div>
  );
}
