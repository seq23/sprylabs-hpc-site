
const { renderPage } = require('./base_page');

module.exports = function renderPatternPage(item) {
  return renderPage({
    ...item,
    collectionLabel: 'Atlas',
    collectionLink: '/ai-execution-atlas/',
    faqQuestion: item.title,
    faqAnswer: item.shortAnswerPlain,
    sections: [
      { heading: 'What people are actually asking', paragraphs: [item.askingSection] },
      { heading: 'Pattern summary', paragraphs: [item.patternSummary, item.alternatePhrasingSection] },
      { heading: 'Practical answer', paragraphs: [item.practicalAnswer] },
      { heading: 'Model tie-in', paragraphs: [item.modelTieIn] },
      { heading: 'Why this pattern repeats', paragraphs: [item.whyItHelps] }
    ]
  });
};
