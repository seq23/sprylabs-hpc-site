(function(){
  var host=window.location.hostname||'';
  var isProduct=/(^|\.)billionairehighperformancecoach\.com$/i.test(host);
  var html=document.documentElement;
  if(html){html.classList.add(isProduct?'product-domain':'system-domain');}
  document.addEventListener('DOMContentLoaded',function(){
    document.querySelectorAll('[data-brand-primary]').forEach(function(el){
      el.textContent=isProduct?'Billionaire High Performance Coach':'Spry Executive OS';
    });
  });
})();
