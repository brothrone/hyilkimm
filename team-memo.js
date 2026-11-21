"use strict";

const byId = id => document.getElementById(id);
const resources = byId("uploads");
const fileToggle = byId("references");
const focusButton = byId("focus");
const zoom = byId("zoom");

function showResources() {
  const hash = location.hash.slice(1);
  const oldAnchors = ["contents", "matrix", "files", "files-exam", "files-sol", "files-class", "files-ref"];
  if (oldAnchors.includes(hash)) {
    location.replace("apdl-home.html" + location.hash);
    return;
  }
  const open = hash === "references";
  resources.hidden = !open;
  document.body.classList.toggle("with-files", open);
  fileToggle.setAttribute("aria-expanded", String(open));
  fileToggle.textContent = open ? "자료 접기" : "자료 함께 보기";
  if (!open) return;
  refreshPreview(byId("reference-editor"));
  window.dispatchEvent(new Event("show-files"));
}
const loading = new WeakSet();
const lastText = new WeakMap();
async function refreshPreview(panel) {
  if (loading.has(panel) || document.hidden || (panel.id === "reference-editor" && resources.hidden)) return;
  loading.add(panel);
  try {
    const response = await fetch("https://pad.nixnet.services/" + panel.dataset.note + "/download", {
      credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("download");
    const value = await response.text();
    if (lastText.get(panel) !== value) {
      const pieces = value.split(/(https?:\/\/[^\s<>]+)/g);
      const nodes = pieces.map((part, index) => {
        if (index % 2 === 0) return document.createTextNode(part);
        const link = document.createElement("a");
        link.href = part; link.textContent = part; link.target = "_blank"; link.rel = "noopener noreferrer";
        return link;
      });
      panel.replaceChildren(...nodes);
      if (!value.trim()) panel.textContent = "아직 작성된 내용이 없습니다.";
      lastText.set(panel, value);
    }
    panel.removeAttribute("title");
  } catch {
    if (!lastText.has(panel)) panel.textContent = "미리보기를 불러오지 못했습니다. 편집 버튼으로 문서를 직접 열 수 있습니다.";
    else panel.title = "마지막으로 불러온 내용입니다.";
  } finally { loading.delete(panel); }
}
function refreshVisible() {
  refreshPreview(byId("memo-preview"));
  refreshPreview(byId("reference-editor"));
}
window.addEventListener("focus", refreshVisible);
document.addEventListener("visibilitychange", refreshVisible);
setInterval(refreshVisible, 12000);
refreshPreview(byId("memo-preview"));
fileToggle.addEventListener("click", () => { location.hash = resources.hidden ? "references" : "manuscript"; });
byId("close-files").addEventListener("click", () => { location.hash = "manuscript"; fileToggle.focus(); });
window.addEventListener("hashchange", showResources);
showResources();

function setFocus(enabled) {
  document.body.classList.toggle("focus", enabled);
  focusButton.setAttribute("aria-pressed", String(enabled));
  focusButton.textContent = enabled ? "집중 보기 종료" : "집중 보기";
}
focusButton.addEventListener("click", () => setFocus(!document.body.classList.contains("focus")));

function applyZoom() {
  document.documentElement.style.setProperty("--memo-scale", zoom.value);
}
try {
  const saved = localStorage.getItem("team-memo-zoom");
  if (Array.from(zoom.options).some(option => option.value === saved)) zoom.value = saved;
} catch { /* Use the default when browser storage is unavailable. */ }
applyZoom();
zoom.addEventListener("change", () => {
  applyZoom();
  try { localStorage.setItem("team-memo-zoom", zoom.value); } catch { /* Session setting still applies. */ }
});

byId("share").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    byId("feedback").textContent = "주소를 복사했습니다.";
    byId("share").textContent = "복사됨";
    setTimeout(() => { byId("share").textContent = "주소 복사"; }, 1600);
  } catch {
    window.prompt("공유할 주소를 복사하세요.", location.href);
  }
});
