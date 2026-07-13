import { computeLearningPct } from './learning-progress';

describe('computeLearningPct', () => {
  it('returns 100 when a topic has no resources', () => {
    expect(computeLearningPct([], () => undefined)).toBe(100);
  });

  it('treats all-zero weights as equal-weight (the unlock bug)', () => {
    // One video, weight 0 (schema default), watched 100%. Previously produced 0
    // and the topic could never unlock. Now normalizes to 100.
    const resources = [{ type: 'Video', weight: 0 }];
    expect(computeLearningPct(resources, () => ({ watchPct: 100 }))).toBe(100);
  });

  it('gives 50 for one of two equal (zero-weight) articles completed', () => {
    const resources = [
      { type: 'Article', weight: 0 },
      { type: 'Article', weight: 0 },
    ];
    expect(
      computeLearningPct(resources, (i) => ({ isCompleted: i === 0 })),
    ).toBe(50);
  });

  it('normalizes by total weight when weights do not sum to 100', () => {
    // weights [30,10] sum to 40; both done → 100%, not 40%.
    const resources = [
      { type: 'Article', weight: 30 },
      { type: 'Video', weight: 10 },
    ];
    expect(
      computeLearningPct(resources, (i) =>
        i === 0 ? { isCompleted: true } : { watchPct: 100 },
      ),
    ).toBe(100);
  });

  it('scales partial video watch by its normalized share', () => {
    // Article weight 50 completed, video weight 50 watched 50% → 75%.
    const resources = [
      { type: 'Article', weight: 50 },
      { type: 'Video', weight: 50 },
    ];
    expect(
      computeLearningPct(resources, (i) =>
        i === 0 ? { isCompleted: true } : { watchPct: 50 },
      ),
    ).toBe(75);
  });

  it('counts missing progress as zero contribution', () => {
    const resources = [
      { type: 'Article', weight: 100 },
      { type: 'Article', weight: 100 },
    ];
    // Only first has progress → 50%.
    expect(
      computeLearningPct(resources, (i) =>
        i === 0 ? { isCompleted: true } : undefined,
      ),
    ).toBe(50);
  });
});
