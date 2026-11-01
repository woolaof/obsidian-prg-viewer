# PRG Viewer

**本插件所有内容全部由AI制作，无人工审查**

在 Obsidian 中只读查看 Project Graph `.prg` 文件。非官方插件，与 Project Graph 作者无关联。

Read-only viewer for Project Graph `.prg` files. Unofficial, not affiliated with Project Graph.

支持 `metadata.version` 为 `2.7.0` 的文件，读取 ZIP 内的 MessagePack 数据并用 Canvas 2D 绘制。插件不写回原文件，不执行文件里的脚本，不联网。

## 功能

- 在文件列表直接打开 `.prg`，显示为独立预览标签页。
- 左侧 Ribbon、命令面板和文件右键菜单都可以打开预览。
- 笔记内使用 `prg-viewer` 代码块嵌入，路径相对当前笔记解析。
- 嵌入的预览可以收起为 40px 高的条，再展开恢复原高度和视角。
- 支持 Fit、滚轮缩放、拖拽平移、双击 Fit、键盘 `+` `-` `0`。
- 跟随 Obsidian 亮色和暗色主题。
- 直接打开的标签页保留 Obsidian 的返回导航。

渲染的对象类型：

- `TextNode`
- `Section`
- `ConnectPoint`
- `LineEdge`
- `ArcEdge`
- `MultiTargetUndirectedEdge`

## 安装

从 Releases 下载 `prg-viewer-0.1.2.zip`，解压到库的插件目录：

```text
<vault>/.obsidian/plugins/prg-viewer/
```

目录中需要：

```text
main.js
manifest.json
styles.css
```

重启 Obsidian，在“设置 > 第三方插件”中关闭安全模式并启用 PRG Viewer。

从源码构建：

```bash
npm ci
npm run build
```

把 `main.js`、`manifest.json`、`styles.css` 放入上面的插件目录。

## 使用

打开 `.prg` 的方式：

1. 在文件列表中点击 `.prg`。
2. 点击左侧 Ribbon 的“PRG 预览”图标，或执行命令“PRG Viewer: 打开 PRG 预览”。
3. 在文件列表中右键 `.prg`，选“用 PRG Viewer 打开”。

在笔记中插入固定高度的预览，执行命令“PRG Viewer: 插入 PRG 预览”并选择文件。也可以直接写代码块：

````markdown
```prg-viewer
example.prg
```
````

路径相对当前笔记所在目录。也支持库根路径、`[[example.prg]]`、`![[example.prg]]` 和引号包裹的路径。网络地址、非 `.prg` 路径和越出库根目录的路径会被拒绝。

嵌入预览的“收起”按钮在预览区左上角。点击后只保留 40px 高的条和“展开”按钮，再点恢复 560px 高度和当前视角。

## 支持范围

- 只支持 `metadata.version === "2.7.0"`，不转换旧版本文件。
- 只渲染上面列出的 6 类对象。图片、附件、URL 卡片、SVG、涂鸦和引用块不显示。
- 折叠 Section 的子对象仍会绘制，折叠态的双层边框尚未实现。
- 没有编辑、导出、搜索和缩略图导航。
- 当前按桌面端发布，移动端没有验证。
- 布局和配色按 Project Graph 4.2.3 对齐，但字体、抗锯齿和主题色可能不同，不保证像素级一致。
- 单个 `.prg` 上限 64 MiB，解压后的 `stage.msgpack` 上限 32 MiB。

## 隐私与安全

插件只在本地读取库内的 `.prg` 文件，不上传文件、不加载远程资源、不执行 `.prg` 内的脚本。预览结果只存在于 Obsidian 的画布中。

## 开发

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run inspect -- 'path/to/example.prg'
```

浏览器 demo 在 `demo/index.html`，使用本地静态服务器打开，不请求网络资源。

## 许可证

MIT，见 `LICENSE`。运行时依赖 `fflate`（MIT）和 `@msgpack/msgpack`（ISC），许可证全文在 `licenses/`，清单见 `THIRD_PARTY_NOTICES.md`。
