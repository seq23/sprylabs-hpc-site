// The Worker's main module. It exports ONLY the fetch handler: workerd reads every named export of
// the main module as an entrypoint, and `wrangler dev` refuses to start on a plain value such as
// ABOUT_FILE ("Incorrect type for map entry"). The route table and its constants stay exported from
// ./index.js, where the validator and the tests import them.
export { default } from './index.js';
