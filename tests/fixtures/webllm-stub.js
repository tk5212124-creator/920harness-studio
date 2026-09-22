window.__installStub=function(){
  const OUT={
    "概念分解":{conceptTokens:["雨の日","家","できること"]},
    "連想1":{words:["読書","映画鑑賞","料理","掃除","ボードゲーム","音楽鑑賞","工作","昼寝"]},
    "連想2":{words:["図書館の本","DVD","パン作り","模様替え","将棋","ギター","折り紙","瞑想"]},
    "関連度1__Judge":{tokenScores:[80,70,90],answerUsefulness:75},
    "関連度2__Judge":{tokenScores:[78,72,88],answerUsefulness:71},
    "回答生成":{items:["読書をする","映画を見る","料理をする"]},
    "回答Judge":{questionFit:85,specificity:75,materialUse:70}};
  const S=window.__stub={loads:0,releases:0,resets:0,calls:0,kvPeak:0,oomAt:null,oomFired:0,out:null,eng:null};
  const P=window.__dbg.eng.PROVIDERS;
  const mkEngine=function(){
    const e={kv:0};
    if(!window.__killReset)e.resetChat=async function(){S.resets++;e.kv=0;};
    e.interruptGenerate=function(){};
    e.chat={completions:{create:async function(opt){
      S.calls++;
      var chars=(opt.messages||[]).reduce(function(a,m){return a+String(m.content||"").length;},0);
      e.kv+=chars;                                  // resetChat しないと積みっぱなしになる
      if(e.kv>S.kvPeak)S.kvPeak=e.kv;
      if(S.oomAt&&S.calls===S.oomAt){S.oomFired++;
        throw new Error("Out of memory: failed to allocate buffer");}
      var text=JSON.stringify(S.out||{ok:true});
      var chunks=Array.from(text).map(function(c){return{choices:[{delta:{content:c}}]};});
      chunks.push({choices:[{finish_reason:"stop"}],usage:{prompt_tokens:200,completion_tokens:text.length}});
      var i=0;
      var it={};
      it[Symbol.asyncIterator]=function(){return{next:async function(){
        return i<chunks.length?{value:chunks[i++],done:false}:{value:undefined,done:true};}};};
      return it;
    }}};
    return e;
  };
  P.webllm.ensureLoaded=async function(def,onProgress){
    S.loads++;onProgress&&onProgress({progress:1,text:"ready(stub)"});
    S.eng=mkEngine();return{engine:S.eng};};
  P.webllm.release=async function(h){S.releases++;};
  const orig=P.webllm.invoke;
  P.webllm.invoke=async function(req){
    S.out=OUT[req.node.id]!==undefined?OUT[req.node.id]:{ok:true};
    return orig(req);};
  return true;
};
