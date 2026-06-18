'use client';

export interface QuestionItemV2 {
  id: string;
  dimension?: string;
  question?: string;
  why?: string;
  examples?: string[];
  my_understanding?: string | null;
  confirm_with_businessperson?: string | null;
  guide_to_say_more?: string | null;
}

interface Props {
  questions: QuestionItemV2[];
  emotional_care?: string | null;
}

export function QuestionsCard({ questions, emotional_care }: Props) {
  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5 mt-2">
      {emotional_care && (
        <div
          className="px-3.5 py-2.5 rounded-lg text-[13px] leading-[1.65]"
          style={{
            background: 'rgba(94,106,210,0.08)',
            border: '1px solid rgba(94,106,210,0.25)',
            color: 'var(--text-primary)',
          }}
        >
          {emotional_care}
        </div>
      )}

      <div
        className="text-[11px] uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)', fontWeight: 600 }}
      >
        AI 反问 · {questions.length} 个问题
      </div>

      {questions.map((q, idx) => {
        const myUnderstanding = q.my_understanding || '';
        const confirmQ = q.confirm_with_businessperson || q.question || '';
        const guideMore = q.guide_to_say_more || '';

        return (
          <div
            key={q.id || idx}
            className="rounded-lg p-3.5"
            style={{
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: 'var(--bg-surface-3)', color: 'var(--text-secondary)' }}
              >
                #{idx + 1}
              </span>
              {q.dimension && (
                <span className="tag tag-accent flex-shrink-0">{q.dimension}</span>
              )}
            </div>

            {myUnderstanding && (
              <div className="mb-2">
                <div
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-medium mb-1"
                  style={{
                    background: 'rgba(94,106,210,0.15)',
                    color: 'var(--accent)',
                  }}
                >
                  我的理解
                </div>
                <div className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-primary)' }}>
                  {myUnderstanding}
                </div>
              </div>
            )}

            {confirmQ && (
              <div className="mb-2">
                <div
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-medium mb-1"
                  style={{
                    background: 'rgba(242,201,76,0.15)',
                    color: 'var(--warning)',
                  }}
                >
                  想跟你确认
                </div>
                <div className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-primary)' }}>
                  {confirmQ}
                </div>
              </div>
            )}

            {guideMore && (
              <div>
                <div
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-medium mb-1"
                  style={{
                    background: 'rgba(76,183,130,0.15)',
                    color: 'var(--success)',
                  }}
                >
                  再多说点
                </div>
                <div className="text-[12.5px] leading-[1.6]" style={{ color: 'var(--text-secondary)' }}>
                  {guideMore}
                </div>
              </div>
            )}

            {!myUnderstanding && !confirmQ && !guideMore && q.question && (
              <div className="text-[13px] leading-[1.6]" style={{ color: 'var(--text-primary)' }}>
                {q.question}
              </div>
            )}

            {q.why && (
              <div
                className="mt-2 pt-2 text-[11px] italic"
                style={{
                  borderTop: '1px dashed var(--border-hairline)',
                  color: 'var(--text-muted)',
                }}
              >
                why: {q.why}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}