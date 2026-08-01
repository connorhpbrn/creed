try {
  const theme = localStorage.getItem("creed:theme");
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
} catch {
  // Storage can be unavailable in privacy-restricted browser contexts.
}

