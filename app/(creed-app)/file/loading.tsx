import { CreedLoader } from "@/components/creed/creed-loader";

// First load of someone's Creed gets the branded breathing mark rather than a
// skeleton of the editor. A skeleton is right when the layout is predictable and
// the wait is short; this wait is the Creed itself arriving, and a fake outline
// of sections that may not match what loads reads worse than the mark. The shell
// sidebar stays mounted around it.
//
// `delayed` keeps it off screen for the first beat, so a Creed that loads
// quickly goes straight to the editor rather than blinking a loader on the way.
//
// Press L in development to preview this screen from any page.
export default function FileLoading() {
  return <CreedLoader delayed />;
}
