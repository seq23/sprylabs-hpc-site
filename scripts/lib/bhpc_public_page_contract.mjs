export const BHPC_PRODUCT_ANCHOR_SENTENCE = 'This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner.';

export function bhpcGeneratedCitationDefinition(query = '') {
  return `${String(query || '').trim()} is addressed with a direct answer, practical decision criteria, and a clear next step.`.slice(0, 520);
}
