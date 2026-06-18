'use client';

export interface QuestionItemV2 {
  id: string;
  question?: string;
  why_matters?: string;
  my_understanding?: string | null;
}

interface Props {
  questions: QuestionItemV2[];
}

export function QuestionsCard({ questions }: Props) {
  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 mt-2">
      {questions.map((q, idx) => {
        const myUnderstanding = q.my_understanding || '';
        const question = q.question || '';
        const whyMatters = q.why_matters || '';

        return (
          <div
            key={q.id || idx}
            className="flex gap-2 items-start text-[13.5px] leading-[1.6]"
            style={{ color: 'var(--text-primary)' }}
          >
            <span
              className="font-mono text-[11px] mt-1 flex-shrink-0 select-none"
              style={{ color: 'var(--gold)' }}
            >
              {idx + 1}.
            </span>
            <div className="flex-1 min-w-0">
              {myUnderstanding && (
                <div style={{ color: 'var(--text-secondary)' }}>{myUnderstanding}</div>
              )}
              {question && <div>{question}</div>}
              {whyMatters && (
                <div
                  className="mt-1 text-[11.5px]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ——{whyMatters}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}