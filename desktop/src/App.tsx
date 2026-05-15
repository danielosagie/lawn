import { useEffect, useState } from "react";
import { api, DesktopSettings, SyncProgress } from "./api";
import { useConvexClient, useConvexQuery, callMutation } from "./useConvex";
import { SettingsView } from "./SettingsView";
import { ProjectsView } from "./ProjectsView";
import { ProjectDetail } from "./ProjectDetail";
import { MountView } from "./MountView";

type Tab = "projects" | "mount" | "settings";

export function App() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [tab, setTab] = useState<Tab>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    void api.settings.get().then(setSettings);
  }, []);

  const client = useConvexClient(
    settings?.convexUrl ?? "",
    settings?.convexAuthToken ?? "",
  );

  // Resolve the configured-ness of the desktop app.
  const isConfigured = Boolean(
    settings?.convexUrl &&
      settings?.convexAuthToken &&
      settings?.storage.bucket &&
      settings?.storage.accessKeyId,
  );

  if (!settings) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#888" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          padding: "12px 18px",
          borderBottom: "2px solid #1a1a1a",
          display: "flex",
          alignItems: "center",
          gap: 12,
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
      >
        <div style={{ fontWeight: 900, letterSpacing: "-0.02em", paddingLeft: 60 }}>
          videoinfra
          <span style={{ color: "#888", fontWeight: 600, marginLeft: 8, fontSize: 12 }}>
            desktop
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <nav style={{ display: "flex", gap: 6, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <TabButton active={tab === "projects"} onClick={() => setTab("projects")}>
            Projects
          </TabButton>
          <TabButton active={tab === "mount"} onClick={() => setTab("mount")}>
            Mount
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            Settings
          </TabButton>
        </nav>
      </header>

      <main style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {!isConfigured ? (
          <SettingsView
            settings={settings}
            onChange={async (next) => {
              const saved = await api.settings.set(next);
              setSettings(saved);
            }}
            client={client}
            firstRun
          />
        ) : tab === "settings" ? (
          <SettingsView
            settings={settings}
            onChange={async (next) => {
              const saved = await api.settings.set(next);
              setSettings(saved);
            }}
            client={client}
          />
        ) : tab === "mount" ? (
          <MountView settings={settings} client={client} />
        ) : selectedProjectId ? (
          <ProjectDetail
            client={client}
            projectId={selectedProjectId}
            rootDir={settings.rootDir}
            onBack={() => setSelectedProjectId(null)}
          />
        ) : (
          <ProjectsView
            client={client}
            onOpen={(projectId) => setSelectedProjectId(projectId)}
          />
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#1a1a1a" : "transparent",
        color: active ? "#f0f0e8" : "#1a1a1a",
        padding: "4px 10px",
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

// Re-export so the renderer modules can use the same types.
export type { DesktopSettings, SyncProgress };
export { useConvexQuery, callMutation };
