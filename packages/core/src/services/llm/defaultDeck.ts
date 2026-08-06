import type { Category, GeneratedCard } from '../../types';

/**
 * Placeholder content returned by the mock generator.
 *
 * It deliberately covers every card type, difficulty and priority so the study
 * runner, filters and scoring can all be exercised straight after a first
 * upload. Once the real model is wired up this file becomes dead code — the
 * generator will return cards derived from the actual PDF instead.
 */

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_fundamentals', name: 'Fundamentals', accent: 'indigo', icon: '📘' },
  { id: 'cat_techniques', name: 'Techniques', accent: 'emerald', icon: '🛠️' },
  { id: 'cat_memory', name: 'Memory science', accent: 'violet', icon: '🧠' },
  { id: 'cat_practice', name: 'Putting it to work', accent: 'amber', icon: '🎯' },
];

export const DEFAULT_CARDS: GeneratedCard[] = [
  {
    type: 'basic',
    front: 'What is spaced repetition?',
    back: 'Reviewing material at increasing intervals over time, rather than all at once, so each review lands just as the memory starts to fade.',
    hint: 'It is about *when* you review, not how long.',
    explanation:
      'Each successful recall at a longer delay strengthens the memory more than an immediate one would, which is why review gaps grow after every correct answer.',
    difficulty: 'easy',
    priority: 'critical',
    categoryId: 'cat_fundamentals',
    tags: ['core', 'scheduling'],
    source: { page: 1, quote: 'Spacing reviews out beats massing them together.' },
  },
  {
    type: 'basic',
    front: 'What is active recall?',
    back: 'Deliberately retrieving information from memory — answering a question before looking — instead of passively re-reading it.',
    hint: 'The opposite of highlighting.',
    explanation:
      'The effort of retrieval is what builds the memory. Recognising an answer you are shown does almost none of that work.',
    difficulty: 'easy',
    priority: 'critical',
    categoryId: 'cat_fundamentals',
    tags: ['core', 'retrieval'],
    source: { page: 1 },
  },
  {
    type: 'cloze',
    front: '',
    back: '',
    clozeText:
      'The {{c1::forgetting curve::named after a 19th-century psychologist}} describes how retention drops sharply within the first {{c2::24 hours}} after learning something new.',
    explanation:
      'Ebbinghaus measured his own recall of nonsense syllables and found the steepest loss happens almost immediately — which is why the first review should come soon.',
    difficulty: 'medium',
    priority: 'high',
    categoryId: 'cat_memory',
    tags: ['ebbinghaus', 'retention'],
    source: { page: 2 },
  },
  {
    type: 'multiple-choice',
    front: 'Which study method has the strongest evidence behind it?',
    back: 'Practice testing',
    choices: [
      { id: 'a', text: 'Re-reading the chapter twice', correct: false },
      { id: 'b', text: 'Practice testing yourself on the material', correct: true },
      { id: 'c', text: 'Highlighting the important sentences', correct: false },
      { id: 'd', text: 'Summarising each paragraph as you read', correct: false },
    ],
    explanation:
      'In large reviews of the literature, practice testing and distributed practice consistently rate as high-utility; re-reading and highlighting rate as low-utility.',
    difficulty: 'medium',
    priority: 'high',
    categoryId: 'cat_techniques',
    tags: ['evidence', 'testing-effect'],
    source: { page: 3 },
  },
  {
    type: 'true-false',
    front: 'Re-reading your notes is one of the most effective ways to study.',
    back: 'False',
    choices: [
      { id: 'true', text: 'True', correct: false },
      { id: 'false', text: 'False', correct: true },
    ],
    explanation:
      'Re-reading feels productive because the material grows familiar, but familiarity is not the same as being able to retrieve it under pressure.',
    difficulty: 'easy',
    priority: 'normal',
    categoryId: 'cat_techniques',
    tags: ['myths'],
    source: { page: 3 },
  },
  {
    type: 'type-in',
    front: 'What is the term for the memory boost you get from being tested on material rather than restudying it?',
    back: 'The testing effect',
    acceptedAnswers: ['testing effect', 'test-enhanced learning', 'retrieval practice effect'],
    hint: 'Two words. The first is what you sit at the end of term.',
    explanation:
      'Also called test-enhanced learning. The act of retrieval changes the memory itself, making it easier to reach next time.',
    difficulty: 'hard',
    priority: 'high',
    categoryId: 'cat_memory',
    tags: ['terminology'],
    source: { page: 4 },
  },
  {
    type: 'reversed',
    front: 'Interleaving',
    back: 'Mixing different topics or problem types within one study session instead of doing all of one kind in a block.',
    hint: 'Think of a shuffled playlist rather than one album on repeat.',
    explanation:
      'Interleaving feels harder and scores worse during practice, but reliably produces better performance on a later test.',
    difficulty: 'medium',
    priority: 'normal',
    categoryId: 'cat_techniques',
    tags: ['core', 'sequencing'],
    source: { page: 4 },
  },
  {
    type: 'cloze',
    front: '',
    back: '',
    clozeText:
      'Conditions that slow learning down but improve long-term retention are called {{c1::desirable difficulties}}.',
    explanation:
      'Spacing, interleaving and retrieval practice all make a session feel harder while making the memory last longer.',
    difficulty: 'hard',
    priority: 'normal',
    categoryId: 'cat_memory',
    tags: ['terminology', 'bjork'],
    source: { page: 5 },
  },
  {
    type: 'multiple-choice',
    front: 'You answered a card correctly and easily. What should happen to its next review interval?',
    back: 'It should grow substantially',
    choices: [
      { id: 'a', text: 'Stay exactly the same', correct: false },
      { id: 'b', text: 'Shrink, so you see it more often', correct: false },
      { id: 'c', text: 'Grow substantially — you clearly know it', correct: true },
      { id: 'd', text: 'The card should be deleted', correct: false },
    ],
    explanation:
      'A scheduler multiplies the interval by an ease factor after each success, so well-known cards drift out to weeks or months and stop wasting your time.',
    difficulty: 'medium',
    priority: 'high',
    categoryId: 'cat_fundamentals',
    tags: ['srs', 'scheduling'],
    source: { page: 5 },
  },
  {
    type: 'type-in',
    front: 'Roughly how many items can working memory hold at once, according to the classic estimate?',
    back: 'About seven (plus or minus two)',
    acceptedAnswers: ['7', 'seven', '7 plus or minus 2', 'seven plus or minus two', '5 to 9'],
    hint: 'A phone number without the area code.',
    explanation:
      "Miller's estimate of 7 ± 2 is the classic figure; later work suggests four chunks is closer to the truth for most material.",
    difficulty: 'medium',
    priority: 'low',
    categoryId: 'cat_memory',
    tags: ['miller', 'capacity'],
    source: { page: 6 },
  },
  {
    type: 'basic',
    front: 'What is elaborative interrogation?',
    back: 'Asking yourself *why* a fact is true and answering it in your own words, connecting the new fact to what you already know.',
    hint: 'It starts with a question word.',
    explanation:
      'Generating the explanation yourself creates more retrieval routes to the fact than being handed the explanation does.',
    difficulty: 'hard',
    priority: 'normal',
    categoryId: 'cat_techniques',
    tags: ['elaboration'],
    source: { page: 6 },
  },
  {
    type: 'basic',
    front: 'What is dual coding?',
    back: 'Pairing words with visuals — a diagram, sketch or timeline alongside the text — so the material is encoded two ways.',
    hint: 'Two channels, not two passes.',
    explanation:
      'Verbal and visual information are processed by partly separate systems, so a diagram gives you a second independent route back to the same idea.',
    difficulty: 'medium',
    priority: 'normal',
    categoryId: 'cat_techniques',
    tags: ['visuals'],
    source: { page: 7 },
  },
  {
    type: 'true-false',
    front: 'Cramming the night before produces worse long-term retention than the same total hours spread across a week.',
    back: 'True',
    choices: [
      { id: 'true', text: 'True', correct: true },
      { id: 'false', text: 'False', correct: false },
    ],
    explanation:
      'Cramming can carry you through a test the next morning, but the spaced schedule wins decisively on any delayed measure.',
    difficulty: 'easy',
    priority: 'high',
    categoryId: 'cat_practice',
    tags: ['cramming', 'spacing'],
    source: { page: 7 },
  },
  {
    type: 'basic',
    front: 'Why should a card only ever ask one thing?',
    back: 'Because a card that asks two things cannot be scored: you might know one half and not the other, and the scheduler has no way to tell.',
    hint: 'Think about what "correct" means for a two-part answer.',
    explanation:
      'Splitting compound cards is the single highest-leverage edit you can make to a deck — it makes both the grading and the scheduling honest.',
    difficulty: 'medium',
    priority: 'critical',
    categoryId: 'cat_practice',
    tags: ['card-design', 'atomicity'],
    source: { page: 8 },
  },
  {
    type: 'cloze',
    front: '',
    back: '',
    clozeText:
      'Grouping individual items into larger meaningful units to get around working-memory limits is called {{c1::chunking}}.',
    explanation:
      'A ten-digit string is impossible to hold; the same digits as a familiar phone number are trivial. The information did not shrink — the number of units did.',
    difficulty: 'easy',
    priority: 'normal',
    categoryId: 'cat_memory',
    tags: ['capacity', 'chunking'],
    source: { page: 8 },
  },
  {
    type: 'basic',
    front: 'What should you do with a card you keep forgetting over and over?',
    back: 'Rewrite it. A card that lapses repeatedly is usually too vague, too long, or asking more than one question — the problem is the card, not your memory.',
    hint: 'The fix is not "review it harder".',
    explanation:
      'Repeat offenders are called leeches. Most decks are better off with the card rewritten into two simpler ones, or suspended entirely.',
    difficulty: 'medium',
    priority: 'high',
    categoryId: 'cat_practice',
    tags: ['leeches', 'card-design'],
    source: { page: 9 },
  },
];

export const DEFAULT_DECK_TITLE = 'How to Actually Learn Things';
export const DEFAULT_DECK_DESCRIPTION =
  'A starter deck on evidence-based study techniques. Generated content is mocked for now — connect an OpenRouter key to build decks from your own PDFs.';
export const DEFAULT_DECK_ICON = '🧠';
