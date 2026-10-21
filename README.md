# 三国杀小抄（个人版改造中）

已移除密码管理器和统计脚本，停用第三方自动更新及在线礼包码注册。完整风险与未完成项见 [安全审计记录](docs/SECURITY_AUDIT.md)。以下为上游开发与发布说明，原作者发布服务不作为个人版依赖。

- [助手功能清单](docs/FEATURES.md)：双端功能、默认开关、已下线功能和个人版变更。
- 密码管理已移除；新版微端会定向清理旧助手密码数据。游戏本身的登录仍保留。

为三国杀 OL 提供微端脚本和浏览器 userscript。功能代码位于 `src/`，打包时会同时生成两种版本。

## 开发

```powershell
npm install
npm run dev              # 启动本地微端开发环境
npm run dev:userscript   # 启动浏览器脚本开发服务器
```

主要目录：

| 目录 | 用途 |
| --- | --- |
| `src/entries` | 微端和浏览器脚本入口 |
| `src/core` | 启动、配置和功能装配 |
| `src/features` | 游戏功能 |
| `src/adapters` | 游戏和平台适配 |
| `src/ui` | 设置面板 |
| `tools/release-app-shell` | 随微端安装包发布的壳程序 |

## 版本

- 根目录 `package.json` 的 `version` 是小抄脚本版本。打包后写入脚本 `@version` 和服务端版本清单。
- `tools/release-app-shell/package.json` 的 `version` 是微端壳版本。只更新脚本功能时不需要修改它。
- 发布版本必须高于线上 API 清单的版本：<https://95chong.cn/api/xiaochao-version>。

## 发布

1. 将根目录 `package.json` 的 `version` 改为高于线上版本的三段号。

2. 在本仓库根目录打包并复制门户文件。两条也可以合成 `npm run pack:portal`：

   ```powershell
   npm run pack
   npm run copy:portal
   ```

   `pack` 会构建微端脚本和 userscript，生成：

   - `release/wd-xc-<版本>.zip`：微端手动安装包。
   - `release/app.zip`：微端自动更新包。
   - `release/xiaochao-manifest.json`：版本、下载地址和 `app.zip` 校验值。
   - `dist/userscript/xiaochao.user.js`：浏览器 userscript。

   `copy:portal` 将安装包、清单和 userscript 复制到 `../sgs-xc-portal/public/downloads`。它会先删除该目录里的旧 `.zip` 文件，再放入本版安装包。

3. 把刚打好的包装进本机微端。先完全退出 `SGSOL.exe`，再在仓库根目录执行：

   ```powershell
   npm run deploy
   ```

   需要管理员权限。`npm run deploy` 执行 `tools/deploy-release.js`：打包 `release/wd-xc-<版本>.zip`（已打包过可加 `--no-pack`）、解压到 `C:\Program Files\SGSOL\resources`，并把 `xiaochao.js` 覆盖到 `%APPDATA%\SGSOL\xiaochao`。装完重新打开微端。

4. 发布下载文件：

   ```powershell
   cd ..\sgs-xc-portal
   npm run deploy:downloads
   ```

   这只同步下载目录。门户页面代码有改动时，才使用门户项目的 `npm run deploy`。

