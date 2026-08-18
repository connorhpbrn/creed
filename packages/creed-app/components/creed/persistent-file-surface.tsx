"use client";

import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ConnectionsLoading } from "@/app/(creed-app)/connections/loading";
import { FileLoading } from "@/app/(creed-app)/file/loading";
import { SettingsLoading } from "@/app/(creed-app)/settings/loading";
import {
  loadConnectionsScreen,
  loadFileScreen,
  loadSettingsScreen,
  preloadConnectionsScreen,
  preloadFileScreen,
  preloadSettingsScreen,
} from "@/components/creed/file-screen-loader";

const LazyFileScreen = lazy(loadFileScreen);
const LazyConnectionsScreen = lazy(loadConnectionsScreen);
const LazySettingsScreen = lazy(loadSettingsScreen);

type AppSurface = "file" | "connections" | "settings";

class SurfaceErrorBoundary extends Component<
  { children: ReactNode; name: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-[var(--creed-surface)] px-6 text-center">
        <div className="max-w-sm">
          <h1 className="t-section text-[var(--creed-text-primary)]">
            {this.props.name} could not load
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-[var(--creed-text-secondary)]">
            Refresh the page to try again.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-[var(--creed-accent)] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--creed-accent-hover)]"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}

function SurfaceFallback({ surface }: { surface: AppSurface }) {
  if (surface === "connections") return <ConnectionsLoading />;
  if (surface === "settings") return <SettingsLoading />;
  return <FileLoading />;
}

const SURFACE_LOADERS: Record<AppSurface, () => void> = {
  file: preloadFileScreen,
  connections: preloadConnectionsScreen,
  settings: preloadSettingsScreen,
};

export function PersistentAppSurfaces({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeSurface: AppSurface | null =
    pathname === "/file"
      ? "file"
      : pathname === "/connections"
        ? "connections"
        : pathname === "/settings"
          ? "settings"
          : null;
  const [mountedSurfaces, setMountedSurfaces] = useState<Set<AppSurface>>(
    () => new Set(activeSurface ? [activeSurface] : []),
  );

  useEffect(() => {
    if (!activeSurface) return;
    setMountedSurfaces((current) => {
      if (current.has(activeSurface)) return current;
      const next = new Set(current);
      next.add(activeSurface);
      return next;
    });
  }, [activeSurface]);

  useEffect(() => {
    const missingSurfaces = (Object.keys(SURFACE_LOADERS) as AppSurface[])
      .filter((surface) => surface !== activeSurface && !mountedSurfaces.has(surface));
    if (missingSurfaces.length === 0) return;

    const preload = () => {
      for (const surface of missingSurfaces) SURFACE_LOADERS[surface]();
    };
    const requestIdle = window.requestIdleCallback?.bind(window);
    if (requestIdle) {
      const idleId = requestIdle(preload, { timeout: 2_000 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preload, 1_000);
    return () => globalThis.clearTimeout(timeoutId);
  }, [activeSurface, mountedSurfaces]);

  const shouldRender = (surface: AppSurface) =>
    activeSurface === surface || mountedSurfaces.has(surface);

  const surfaceProps = (surface: AppSurface) => ({
    className: "h-full",
    hidden: activeSurface !== surface,
    inert: activeSurface !== surface,
    "aria-hidden": activeSurface !== surface,
    "data-persistent-app-surface": surface,
  });

  return (
    <>
      {shouldRender("file") ? (
        <div {...surfaceProps("file")}>
          <SurfaceErrorBoundary name="The file">
            <Suspense fallback={<SurfaceFallback surface="file" />}>
              <LazyFileScreen active={activeSurface === "file"} />
            </Suspense>
          </SurfaceErrorBoundary>
        </div>
      ) : null}
      {shouldRender("connections") ? (
        <div {...surfaceProps("connections")}>
          <SurfaceErrorBoundary name="Connections">
            <Suspense fallback={<SurfaceFallback surface="connections" />}>
              <LazyConnectionsScreen active={activeSurface === "connections"} />
            </Suspense>
          </SurfaceErrorBoundary>
        </div>
      ) : null}
      {shouldRender("settings") ? (
        <div {...surfaceProps("settings")}>
          <SurfaceErrorBoundary name="Settings">
            <Suspense fallback={<SurfaceFallback surface="settings" />}>
              <LazySettingsScreen active={activeSurface === "settings"} />
            </Suspense>
          </SurfaceErrorBoundary>
        </div>
      ) : null}
      {!activeSurface ? children : null}
    </>
  );
}
