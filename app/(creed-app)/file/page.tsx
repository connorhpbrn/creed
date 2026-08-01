import { CreedBootSplashCleanup } from "@/components/creed/creed-boot-splash-cleanup";
import { FileScreen } from "@/components/creed/file-screen";

export default function FilePage() {
  return (
    <>
      <FileScreen />
      {/* Lifts the boot splash. It sits *after* the editor rather than on it:
          HTML streams in document order, so the editor's own root tag arrives
          before its contents and would have pulled the splash away over a
          half-built page. Reaching this marker means the editor's markup is
          complete. */}
      <div data-creed-editor="" hidden />
      <CreedBootSplashCleanup />
    </>
  );
}
