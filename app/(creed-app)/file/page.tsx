import { CreedLoaderCurtain } from "@/components/creed/creed-loader-curtain";
import { FileScreen } from "@/components/creed/file-screen";

export default function FilePage() {
  return (
    <>
      <FileScreen />
      {/* Fades the loading screen out over the real editor instead of letting
          Next's swap cut straight to it. See ./loading.tsx. */}
      <CreedLoaderCurtain />
    </>
  );
}
