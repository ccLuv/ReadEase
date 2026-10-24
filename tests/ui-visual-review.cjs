const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const {mkdtemp,rm,readFile,mkdir}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');

(async()=>{
  const root=resolve(__dirname,'..'),data=await mkdtemp(join(tmpdir(),'readease-ui-review-'));
  const out=join(root,'test-results'),port='4190',base=`http://127.0.0.1:${port}`,mock=process.argv.includes('--agent-mock'),dark=process.argv.includes('--dark');
  const file=name=>join(out,dark?name.replace('.png','-dark.png'):name);
  await mkdir(out,{recursive:true});
  const args=mock?['--import',pathToFileURL(join(__dirname,'mock-agent-fetch.mjs')).href,join(root,'server.mjs')]:[join(root,'server.mjs')];
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,PORT:port,DATA_DIR:data,AI_PROVIDER:'deepseek',DEEPSEEK_API_KEY:mock?'test-key':'',AI_CONFIG_PATH:join(data,'none.json')},stdio:['ignore','pipe','pipe']});
  let browser;
  try{
    let error='';child.stderr.on('data',chunk=>{error+=chunk.toString();});
    await Promise.race([new Promise((yes,no)=>{child.stdout.on('data',chunk=>{if(chunk.toString().includes('ReadEase'))yes();});child.on('error',no);child.on('exit',code=>no(Error(`服务退出 ${code}: ${error}`)));}),new Promise((_,no)=>setTimeout(()=>no(Error('服务启动超时')),5000))]);
    browser=await chromium.launch({channel:'msedge',headless:true});
    if(process.argv.includes('--motion-video')){
      const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block',recordVideo:{dir:out,size:{width:1440,height:900}}});
      const preview=await context.newPage();
      await preview.goto(base);
      await preview.locator('#import-file').setInputFiles({name:'雾港钟表店.txt',mimeType:'text/plain',buffer:await readFile(join(root,'samples','雾港钟表店.txt'))});
      await preview.locator('.book-open').first().waitFor();
      await preview.waitForTimeout(9000);
      const video=preview.video();await context.close();
      await video.saveAs(join(out,'background-flow.webm'));
      console.log('动态背景预览视频已生成');
      return;
    }
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
    await page.goto(base);
    assert.equal(await page.locator('.layout').count(),1);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.layout'),'::before').animationName),'libraryGlow');
    const firstFrame=await page.evaluate(()=>getComputedStyle(document.querySelector('.layout'),'::before').transform);
    await page.waitForTimeout(550);
    const nextFrame=await page.evaluate(()=>getComputedStyle(document.querySelector('.layout'),'::before').transform);
    assert.notEqual(nextFrame,firstFrame,'书架背景没有产生缓慢位移');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.layout'),'::before').animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('#import-file').setInputFiles(mock?{name:'测试故事.txt',mimeType:'text/plain',buffer:Buffer.from('第一章 起点\n小遥认识阿舟。\n第二章 灯塔\n阿舟找到了灯塔。')}:{name:'雾港钟表店.txt',mimeType:'text/plain',buffer:await readFile(join(root,'samples','雾港钟表店.txt'))});
    await page.locator('.book-open').first().waitFor();
    await page.screenshot({path:file('ui-shelf-desktop.png')});
    if(process.argv.includes('--motion-compare')){
      await page.waitForTimeout(6000);
      await page.screenshot({path:file('ui-shelf-desktop-later.png')});
    }
    await page.locator('.book-open').first().click();
    assert.equal(await page.locator('.layout').count(),0,'阅读页不应显示书架动态背景');
    if(dark){await page.getByRole('button',{name:'阅读设置'}).click();await page.locator('[data-theme="dark"]').click();}
    await page.getByRole('button',{name:'AI 阅读助手'}).click();
    await page.screenshot({path:file('ui-agent-desktop.png')});
    await page.locator('#assistant-question').fill(mock?'第二章阿舟找到了什么？':'第二章的人物为什么改变主意');
    await page.getByRole('button',{name:'基于原文回答'}).click();
    await page.locator('.assistant-answer').waitFor();
    if(mock)await page.locator('.agent-trace').evaluate(el=>{el.open=true;});
    await page.screenshot({path:file('ui-agent-answer-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:file('ui-agent-mobile.png')});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'AI 页面出现横向滚动');
    await page.locator('.reader-panel').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.screenshot({path:file('ui-agent-mobile-bottom.png')});
    await page.locator('#reader-back').click();
    await page.screenshot({path:file('ui-shelf-mobile.png')});
    await page.locator('[data-view="stats"]').click();
    await page.screenshot({path:file('ui-stats-mobile.png')});
    for(const [id,title] of [['notes','阅读笔记'],['catalog','发现书库'],['account','账户与数据']]){
      await page.locator(`[data-view="${id}"]`).click();
      assert.equal(await page.locator('.topbar h1').textContent(),title);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${title}页面出现横向滚动`);
    }
    console.log('UI 截图完成');
  }finally{
    await browser?.close();
    if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
    await rm(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
