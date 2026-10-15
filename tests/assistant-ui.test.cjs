const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const context=await browser.newContext();
    const page=await context.newPage();
    const base='http://127.0.0.1:4175';
    const status=await (await context.request.get(base+'/api/assistant/status')).json();
    assert.equal(status.configured,false,'UI test must not use a real API key');
    await page.goto(base);
    await page.locator('#import-file').setInputFiles(path.resolve(__dirname,'../samples/window-notes.epub'));
    await page.locator('.book-open').first().click();
    assert.match(await page.locator('.reader-content h1').textContent(),/第一章/);
    await page.getByRole('button',{name:'AI 阅读助手'}).click();
    await page.locator('#assistant-question').fill('第二章主要讲了什么？');
    await page.getByRole('button',{name:'基于原文回答'}).click();
    const source=page.locator('[data-ai-source]').first();
    await source.waitFor();
    assert.match(await source.textContent(),/第二章/);
    await source.click();
    await page.waitForFunction(()=>document.querySelector('.reader-content h1')?.textContent.includes('第二章'));
    await page.locator('#assistant-question').fill('今天的股票价格是多少？');
    await page.getByRole('button',{name:'基于原文回答'}).click();
    await page.getByText(/无法回答：在这本书中没有找到/).waitFor();
    assert.equal(await page.locator('[data-ai-source]').count(),0);
    console.log('PASS 跨章节问答、引用跳转、书外问题拒答');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
