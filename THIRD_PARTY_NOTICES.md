# Third-party notices

本项目只在运行时打包 `fflate` 与 `@msgpack/msgpack`。开发依赖不进入插件产物。

## 运行时

| 包 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| [`fflate`](https://www.npmjs.com/package/fflate) | 0.8.3 | MIT | 解压 `.prg` 的 ZIP 容器 |
| [`@msgpack/msgpack`](https://www.npmjs.com/package/@msgpack/msgpack) | 3.1.3 | ISC | 解码 `stage.msgpack` 等文件 |

`@msgpack/msgpack` 的许可证是 ISC，不是 MIT；ISC 与 MIT 同为宽松许可证，允许商用、修改和再分发，要求保留版权与许可声明。

完整许可证文本在 `licenses/fflate-LICENSE.txt` 和 `licenses/msgpack-LICENSE.txt`，随插件发布包一起分发。

## 开发

| 包 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| [`typescript`](https://www.npmjs.com/package/typescript) | 5.9.3 | Apache-2.0 | 类型检查 |
| [`tsx`](https://www.npmjs.com/package/tsx) | 4.23.15 | MIT | 直接运行 TypeScript 脚本 |
| [`vitest`](https://www.npmjs.com/package/vitest) | 3.2.7 | MIT | 单元测试 |
| [`@types/node`](https://www.npmjs.com/package/@types/node) | 22.20.5 | MIT | Node 类型声明 |
| [`esbuild`](https://www.npmjs.com/package/esbuild) | 0.25.10 | MIT | 打包 `main.js` |
| [`obsidian`](https://www.npmjs.com/package/obsidian) | 1.14.4 | MIT | Obsidian 类型声明，运行时由宿主提供 |

## 未使用的上游包

`@graphif/serializer`、`@graphif/shapes`、`@graphif/data-structures` 都是 MIT，但本项目没有把它们打进产物。原因见 `docs/UPSTREAM-RESEARCH.md` 的 Serializer 评估：它们不包含 GPL 的 Scene 类，单独使用仍要重写类注册，收益不足。

Project Graph 桌面应用本体是 GPL-3.0。本项目只阅读它来确认字段语义，没有复制其源代码。
