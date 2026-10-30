# 卫戍协议：盟约 · 个人演习版

**这是基于 [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 0.3.3 的二次开发项目，非原创完整游戏，也不是鹰角官方项目。**

本项目由 [drkiyira-dev](https://github.com/drkiyira-dev) 维护，将上游改为私人浏览器单人版，沿用其干员、技能、盟约、装备、策略、商店、难度和自动作战逻辑，新增浏览器内运行、休整存档及部署优化。感谢原项目作者与贡献者。

代码许可证为 **GPL-3.0-or-later（GNU GPL 第 3 版或更新版本）**，与上游保持一致。完整条款见 [LICENSE](LICENSE)；上游署名与素材权利声明见 [NOTICE.md](NOTICE.md)。角色、美术、音乐与游戏数据不因代码开源而改用 GPL。

## 运行

需要 Node.js 22+、Python 3。上游安装步骤会生成浏览器所需的 Pixi、Preact 等依赖文件。

```sh
npm ci
npm --prefix upstream ci --omit=dev
python3 personal/cache-visual-assets.py
python3 personal/cache-audio-fonts.py
npm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 http://127.0.0.1:4173/，填写博士代号，依次选择「开始 → 独立模拟 → 难度 → 开始模拟」。桌面宽屏或横屏体验最佳。

代码仓库不打包运行所需的立绘、模型和音频素材（上游文档截图与规则数据保留其原声明）。首次素材下载约 400 MB，来源记录在 `personal/*source-map.json`。下载脚本支持已有文件续传；后续修改源码只需再次运行 `npm run build`。

## 本次修改

- 把上游 Lobby / Network / Match 放入浏览器 Worker，单人演习不依赖原站服务器。
- 标题页久置、连接超时后可自动建立新连接，并保留当前单人房间与身份。
- 休整期自动保存到当前浏览器。重新打开进入大厅后可「继续上次休整」；战斗中退出回到最后一个休整存档，不保存战斗中的每一帧。
- 保留棋盘、整备区、资金、商店、盟约、装备、库存、敌人预定波次和六路随机数状态。数据或引擎版本不兼容时拒绝恢复。
- 切换到后台自动暂停单人战斗；保留原操作和二次确认。
- 骨骼动画采用无损 gzip 传输，浏览器解压后交给原渲染器；原始数据逐字节保持一致。
- Spine、头像、界面、背景音乐、界面音效与基础战斗音效由本站提供。为满足 Sites 的 256 MiB 上传限制，立绘和教程图片按需从记录的公开原素材源加载；本机原文件保留在 `.cache/art-originals/`。未打包全量干员语音和专属战斗音效。

本版只开放独立模拟，未实现联机同盟、远程 AI 或原站账号同步。战斗规则保持上游实现；它是非官方同人复刻，不能保证与官方每个细节完全相同。演习计算不依赖原站服务器；存档和设置在当前浏览器中，立绘与教程图片需要访问公开素材源。

## 二次开发入口

- `upstream/data/`：干员、装备、盟约、敌人与波次等规则数据。
- `upstream/server/sim/content/`：干员技能、盟约和相关战斗行为。
- `upstream/public/js/`：上游界面与渲染逻辑。
- `personal/`：本项目的浏览器主机、自动存档、素材适配和构建代码。

上游源码单独保存在 `upstream/`，便于跟踪修改与后续同步；本项目的改动集中在 `personal/`。公开的是开发源码，私人站点的访问权限保持不变。

## 验证与源码

```sh
npm test
```

测试覆盖真实协议下招募、部署、完整战斗结算、下一回合，以及恢复后棋盘/库存/商店/随机状态/下一轮结果的一致性。

`upstream/` 保留本次移植所用源码；`personal/` 是移植、存档、构建与测试代码。`personal/迁移研究.md` 记录参考资料。`dist/` 为生成结果，不提交到 Git。

代码遵循 GPL-3.0-or-later；角色和游戏素材的权利归原权利人，详见 [NOTICE.md](NOTICE.md)、[LICENSE](LICENSE) 与上游声明。本项目用于私人、非商业演习。
