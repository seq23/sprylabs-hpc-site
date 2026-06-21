(function(){
  var host=window.location.hostname||'';
  var isProduct=/(^|\.)billionairehighperformancecoach\.com$/i.test(host);
  var isSpry=/(^|\.)spryexecutiveos\.com$/i.test(host);
  var html=document.documentElement;
  if(html){html.classList.add(isProduct?'product-domain':(isSpry?'system-domain':'preview-domain'));}
  // Brand text is intentionally source-authored in HTML.
  // Do not rewrite the brand on localhost or spryexecutiveos.com; it caused
  // "Spry Executive OS by Spry Executive OS" in preview and weakened product clarity.
})();
