
const { renderPage } = require('./base_page');

module.exports = function renderQuestionPage(item) {
  const evidence = item.evidenceSummary || 'Public Reddit questions repeatedly asked for a tighter system, less drift, and clearer daily execution support.';
  return renderPage({
    ...item,
    collectionLabel: 'Answers',
    collectionLink: '/answers/',
    faqQuestion: item.title,
    faqAnswer: item.shortAnswerPlain,
    sections: [
      { heading: 'What people are actually asking', paragraphs: [item.askingSection] },
      { heading: 'Pattern summary', paragraphs: [item.patternSummary] },
      { heading: 'Practical answer', paragraphs: [item.practicalAnswer] },
      { heading: 'Model tie-in', paragraphs: [item.modelTieIn] },
      { heading: 'Why this page exists', paragraphs: [evidence] }
    ]
  });
};
