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
  if (!byId("frame-references")) {
    const frame = document.createElement("iframe");
    frame.id = "frame-references";
    frame.title = "자료 링크 공동 편집";
    frame.src = "https://annuel.framapad.org/p/hyilkimm-kagome-references-6d98f3?showChat=false&showLineNumbers=false&lang=ko";
    frame.referrerPolicy = "no-referrer";
    byId("reference-editor").append(frame);
  }
  window.dispatchEvent(new Event("show-files"));
}
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
