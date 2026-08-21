const root = document.documentElement;
const button = document.querySelector(".theme-toggle");

function preferredTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  if (button) button.setAttribute("aria-label", theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
}

applyTheme(root.dataset.theme || preferredTheme());

button?.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try { localStorage.setItem("theme", nextTheme); } catch (error) { /* Trình duyệt có thể chặn lưu cục bộ. */ }
});
