'use strict';
function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function makeThrottle(options){
  const minDelayMs = Number((options && options.minDelayMs) || process.env.SOCIAL_MIN_DELAY_MS || 750);
  let last = 0;
  return async function throttle(){
    const now = Date.now();
    const wait = Math.max(0, minDelayMs - (now - last));
    if(wait) await sleep(wait);
    last = Date.now();
  };
}
module.exports = { sleep, makeThrottle };
