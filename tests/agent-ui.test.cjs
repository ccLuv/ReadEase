const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  const root=resolve(__dirname,'..'),dir=await mkdtemp(join(tmpdir(),'readease-agent-ui-')),port='4187',base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['--import',pathToFileURL(join(__dirname,'mock-agent-fetch.mjs')).href,join(root,'server.mjs')],{
    cwd:root,env:{...process.env,PORT:port,DATA_DIR:dir,AI_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'test-key',AI_CONFIG_PATH:join(dir,'none.json')},stdio:['ignore','pipe','pipe']
  });
  let browser;
  try{
    let stderr='';child.stderr.on('data',c=>{stderr+=c.toString();});
    let timer;await Promise.race([
      new Promise((res,rej)=>{child.stdout.on('data',c=>{if(c.toString().includes('ReadEase'))res();});child.on('error',rej);child.on('exit',code=>rej(Error(`服务退出 ${code}: ${stderr.slice(0,500)}`)));}),
      new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error(`服务启动超时: ${stderr.slice(0,500)}`)),5000);})
    ]);clearTimeout(timer);
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext(),page=await context.newPage();
    await page.goto(base);
    await page.locator('#import-file').setInputFiles({name:'测试故事.txt',mimeType:'text/plain',buffer:Buffer.from('第一章 起点\n小遥认识阿舟。\n第二章 灯塔\n阿舟找到了灯塔。')});
    await page.locator('.book-open').first().click();
    await page.getByRole('button',{name:'AI 阅读助手'}).click();
    await page.locator('#assistant-question').fill('第二章阿舟找到了什么？');
    await page.getByRole('button',{name:'基于原文回答'}).click();
    await page.locator('.assistant-answer').waitFor();
    assert.match(await page.locator('.assistant-answer').textContent(),/阿舟找到了灯塔/);
    assert.match(await page.locator('.agent-trace').textContent(),/搜索全书/);
    assert.equal(await page.locator('#assistant-question').inputValue(),'第二章阿舟找到了什么？');
    await page.locator('[data-ai-source]').first().click();
    await page.waitForFunction(()=>document.querySelector('.reader-content h1')?.textContent.includes('第二章'));
    assert.match(await page.locator('.reader-content h1').textContent(),/第二章/);
    await page.locator('#assistant-question').fill('今天股票价格是多少？');
    await page.getByRole('button',{name:'基于原文回答'}).click();
    await page.getByText(/无法回答：这本书没有提供足够的相关依据/).waitFor();
    assert.equal(await page.locator('[data-ai-source]').count(),0);
    console.log('PASS Agent 工具轨迹、跨章节引用跳转、书外拒答');
  }finally{
    await browser?.close();
    if(child.exitCode===null){child.kill();await new Promise(res=>child.once('exit',res));}
    await rm(dir,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
