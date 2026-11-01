import { parsePrg } from "../src/prg/parser";
import { PrgViewer } from "../src/viewer/viewer";

const host = document.getElementById("viewer");
const status = document.getElementById("status");
const input = document.getElementById("file") as HTMLInputElement | null;
const drop = document.getElementById("drop");

let viewer: PrgViewer | null = null;

function setStatus(message: string, isError = false): void {
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function load(data: Uint8Array, name: string): void {
  viewer?.destroy();
  viewer = null;
  try {
    const scene = parsePrg(data);
    if (!host) {
      throw new Error("缺少预览容器");
    }
    viewer = new PrgViewer(host, scene, {
      height: Math.min(760, Math.max(420, window.innerHeight - 240)),
      dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
    });
    (window as unknown as { __prgViewer?: PrgViewer }).__prgViewer = viewer;
    (window as unknown as { __prgScene?: unknown }).__prgScene = scene;
    setStatus(
      `${name} · ${scene.stageEntries} 项 / ${scene.objects.length} 个对象${
        scene.warnings.length > 0 ? ` · ${scene.warnings.length} 条警告` : ""
      }`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`解析失败：${message}`, true);
  }
}

async function loadFile(file: File): Promise<void> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  load(buffer, file.name);
}

input?.addEventListener("change", () => {
  const file = input.files?.[0];
  if (file) {
    void loadFile(file);
  }
});

drop?.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("is-over");
});
drop?.addEventListener("dragleave", () => drop.classList.remove("is-over"));
drop?.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("is-over");
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    void loadFile(file);
  }
});

const fixture = new URLSearchParams(window.location.search).get("fixture");
if (fixture) {
  const fixtureUrl = new URL(fixture, window.location.href);
  if (fixtureUrl.origin !== window.location.origin) {
    setStatus("只允许加载同源文件", true);
  } else {
    void fetch(fixtureUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => load(new Uint8Array(buffer), decodeURIComponent(fixture.split("/").pop() ?? fixture)))
      .catch((error: unknown) => setStatus(`加载失败：${String(error)}`, true));
  }
}
