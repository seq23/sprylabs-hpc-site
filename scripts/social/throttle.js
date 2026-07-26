'use strict';
function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function makeThrottle(options = {}){
  const minDelayMs = Number(options.minDelayMs || process.env.SOCIAL_MIN_DELAY_MS || 750);
  const maxRequests = Number(options.maxRequests || process.env.SOCIAL_MAX_REQUESTS || 25);
  const maxRuntimeMs = Number(options.maxRuntimeMs || process.env.SOCIAL_MAX_RUNTIME_MS || 120000);
  const retryLimit = Number(options.retryLimit || process.env.SOCIAL_RETRY_LIMIT || 2);
  const backoffMs = Number(options.backoffMs || process.env.SOCIAL_BACKOFF_MS || 1500);
  let last = 0;
  let requests = 0;
  const startedAt = Date.now();
  async function throttle(){
    if (requests >= maxRequests) throw new Error(`social throttle max requests exceeded: ${maxRequests}`);
    if (Date.now() - startedAt > maxRuntimeMs) throw new Error(`social throttle max runtime exceeded: ${maxRuntimeMs}`);
    const now = Date.now();
    const wait = Math.max(0, minDelayMs - (now - last));
    if(wait) await sleep(wait);
    requests += 1;
    last = Date.now();
  }
  throttle.retry = async function retry(fn){
    let attempt = 0;
    while (true) {
      try { await throttle(); return await fn(); }
      catch (err) {
        if (attempt >= retryLimit) throw err;
        await sleep(backoffMs * Math.pow(2, attempt));
        attempt += 1;
      }
    }
  };
  throttle.state = () => ({ requests, maxRequests, minDelayMs, maxRuntimeMs, retryLimit, backoffMs });
  return throttle;
}
module.exports = { sleep, makeThrottle };
