const realFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
  if(String(url)!=='https://api.deepseek.com/responses')return realFetch(url,options);
  const request=JSON.parse(options.body);
  const hasOutput=request.input.some(item=>item.type==='function_call_output');
  const outside=String(request.input.find(item=>item.role==='user')?.content||'').includes('股票');
  return Response.json(hasOutput
    ?{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(outside?{answer:'无法回答',citations:[],insufficient:true}:{answer:'阿舟找到了灯塔。',citations:['C1_0'],insufficient:false})}]}]}
    :{status:'completed',output:[{type:'function_call',call_id:'search-test',name:'search_book',arguments:JSON.stringify({query:outside?'今天股票价格':'第二章阿舟灯塔',limit:3})}]});
};
