
const { renderPage } = require('./base_page');

module.exports = function renderRoundupPage(item) {
  return renderPage({
    ...item,
    collectionLabel: 'Answers',
    collectionLink: '/answers/',
    faqQuestion: item.title,
    faqAnswer: item.shortAnswerPlain,
    sections: [
      { heading: 'What people are actually asking', paragraphs: [item.askingSection, item.alternatePhrasingSection] },
      { heading: 'Pattern summary', paragraphs: [item.patternSummary] },
      { heading: 'Practical answer', paragraphs: [item.practicalAnswer] },
      { heading: 'Related framework', paragraphs: [item.modelTieIn] },
      { heading: 'Why this roundup helps', paragraphs: [item.whyItHelps] }
    ]
  });
};
