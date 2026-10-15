# 复现测试

## 服务端

在项目根目录运行：

```powershell
node --test tests/server.test.mjs tests/assistant.test.mjs
```

测试使用 4174 端口和系统临时目录，结束后清理自身临时数据库。无需真实账号或网络。`assistant-ui.test.cjs` 单独使用 4175 端口及未配置密钥的服务端验证跨章节问答、引用跳转和书外拒答；其服务端需由测试者自行启动，且不能使用真实 AI 配置。

## 浏览器

先启动 4173 服务。测试需要单独准备 Playwright 和 Edge（不会随产品运行时安装）。可在测试环境安装 Playwright：

```powershell
npm install --no-save playwright
node tests/ui-test.cjs
```

也可以将环境变量 PLAYWRIGHT_MODULE 指向已有 Playwright 模块路径。脚本调用已安装的 Microsoft Edge，使用临时浏览器上下文。输出位于 test-results。测试注册的账号为 `ui-时间戳@example.test`，它是本机测试账号，不会发送邮件。

复现时需保持当前版本服务和样例目录完整。截图与流水线耗时仅作为验证证据，不是性能验收统计。浏览器测试不覆盖所有解析格式、真实手机平台或四小时稳定性。
