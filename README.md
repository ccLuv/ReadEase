# 悦读轻阅 ReadEase

ReadEase 是一款在本机运行的电子阅读器。Windows 上启动 Node.js 服务后，用浏览器访问阅读界面；书籍和阅读设置保存在当前浏览器，账号与同步记录保存在本机 SQLite。阅读、书内检索无需网络；配置模型 API 后，可用 AI 阅读助手依据当前书籍的章节内容回答问题。

## 运行环境与启动

需要 **Node.js 24 或更高版本**。本仓库只保存源码，不附带 `node.exe`、用户数据或 API Key。无需 `npm install`。

Windows：

1. 下载或克隆本仓库，并在电脑上安装 Node.js 24+，确保命令行运行 `node --version` 能看到版本号。
2. 双击 `Start.bat`；也可在项目目录运行 `node server.mjs`。
3. 浏览器打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。使用 `node server.mjs` 时按 `Ctrl+C` 停止；使用 `Start.bat` 时双击 `Stop.bat` 停止。
4. 点击“加入示例书籍”，或导入自己合法持有的 TXT、EPUB、PDF 文件。

首次启动会自动创建 `data/`。请始终使用 `127.0.0.1:4173` 访问；浏览器将 `localhost` 与 `127.0.0.1` 视为不同存储空间。非 Windows 系统可安装 Node.js 24+ 后运行 `node server.mjs`。

## 主要功能

- 导入 TXT（UTF-8、UTF-16、GB18030）、无加密文字型 EPUB 和 PDF；对文本书籍解析章节、去重和定位阅读进度。
- 本地书架搜索、分类、排序、元数据编辑；阅读设置、目录、书签、摘录高亮、笔记、书内搜索及阅读统计。
- IndexedDB 保存书籍与阅读记录，Service Worker 缓存离线页面；JSON 备份与恢复。
- 邮箱注册与密码登录，以及同一服务端上的进度、书签和笔记同步；冲突时由用户选择保留版本。
- AI 阅读助手检索当前 TXT/EPUB 书籍的所有章节并展示引用依据；书内没有依据时拒答。PDF 暂不支持文本问答。

## 可选的模型 API

默认使用本地原文检索，不需要 API Key。Windows 上可双击 `配置DeepSeek.bat` 输入自己的 Key，随后重启服务。配置写入 `config/ai-config.json`，该文件已被 Git 忽略。请勿将 Key 写入代码、提交到仓库或随问题截图公开。模板见 `config/ai-config.example.json`。

配置模型后，相关书籍片段与问题会发送给所选模型服务；不希望发送内容时保持默认模式。

## 开发与测试

项目无需前端构建。`server.mjs` 提供本地接口和静态文件；`app/` 包含阅读界面、解析器、存储与离线缓存；`schema.sql` 定义数据库；`samples/` 包含演示书籍与测试样本。

在项目目录运行 `npm test`，或运行 `node --test tests/server.test.mjs tests/assistant.test.mjs`。浏览器测试另需 Playwright 与 Microsoft Edge，详见 [tests/README.md](tests/README.md)。

本仓库不含运行时、录屏、课程报告、个人阅读数据和本机模型配置。第三方静态依赖及许可说明见 [THIRD-PARTY.md](THIRD-PARTY.md)。
