try {
  const theme = localStorage.getItem("creed:theme");
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
} catch {
  // Storage can be unavailable in privacy-restricted browser contexts.
}

// Boot splash for the editor. Opening /file as a fresh document - a reload, a
// new tab, a pasted link - waits on the app layout's session and Creed reads
// before anything renders, and that wait sits above every route-level loading
// boundary, so the page would otherwise sit blank until the server was done.
//
// Marking the document here, in the same head script that sets the theme, means
// the splash paints with the very first bytes of the shell. It only marks a real
// document load, so a client-side navigation into /file never sees it.
try {
  const path = window.location.pathname;
  if (path === "/file" || path.startsWith("/file/")) {
    document.documentElement.classList.add("creed-booting");
  }
} catch {
  // Same defensive posture as above: never let the boot script throw.
}
