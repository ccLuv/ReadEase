# 复现测试

## 服务端

在项目根目录运行：

```powershell
node --test tests/server.test.mjs tests/assistant.test.mjs tests/agent.test.mjs tests/agent-server.test.mjs
```

测试使用本机端口和系统临时目录，结束后清理自身临时数据库。Agent 测试使用 `mock-agent-fetch.mjs` 模拟 DeepSeek 返回的工具请求，不使用真实 API Key，也不访问模型网络。`assistant-ui.test.cjs` 单独使用 4175 端口及未配置密钥的服务端验证离线跨章节检索；其服务端需由测试者自行启动，且不能使用真实 AI 配置。

已安装 Playwright 和 Edge 时，可直接运行模拟模型的 Agent 浏览器测试：

```powershell
$env:PLAYWRIGHT_MODULE = '已安装的 playwright 模块路径'
node tests/agent-ui.test.cjs
```

此测试会启动临时本机服务，验证工具轨迹、引用跳转和书外拒答，结束后自动清理。

`node tests/ui-visual-review.cjs` 会在 `test-results/` 生成桌面和手机端的书架、AI 面板及阅读分析截图，检查排版、书架背景动画及减少动态效果设置；它使用未配置密钥的临时本机服务，不调用真实模型。
加上 `--motion-video` 可生成九秒的 `test-results/background-flow.webm` 动态背景预览。

如需核对真实 DeepSeek 工具调用协议，可在已配置 API Key 的电脑上手动运行 `node tests/live-agent-smoke.mjs`。它会用《雾港钟表店》测试抽象的章节提问，并用《星河邮差》测试书内问答和书外拒答；只复现《雾港钟表店》的问题可加 `--fog-only`，只测试全书概括可加 `--summary-only`。测试会调用真实模型并产生 API 用量；服务数据放在临时目录，运行后删除，不改变平时阅读界面的调用统计。

## 浏览器

先启动 4173 服务。测试需要单独准备 Playwright 和 Edge（不会随产品运行时安装）。可在测试环境安装 Playwright：

```powershell
npm install --no-save playwright
node tests/ui-test.cjs
```

也可以将环境变量 PLAYWRIGHT_MODULE 指向已有 Playwright 模块路径。脚本调用已安装的 Microsoft Edge，使用临时浏览器上下文。输出位于 test-results。测试注册的账号为 `ui-时间戳@example.test`，它是本机测试账号，不会发送邮件。

复现时需保持当前版本服务和样例目录完整。截图与流水线耗时仅作为验证证据，不是性能验收统计。浏览器测试不覆盖所有解析格式、真实手机平台或四小时稳定性。
