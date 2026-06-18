export function sanitizeAiText(text: string | null | undefined): string {
  if (!text) return '';
  let s = String(text);

  s = s.replace(/^\s*(?:\d+\.\s*)?(?:\*\*)?\s*(开场白|开头|寒暄|引子)(?:\*\*)?\s*\n+/iu, '');

  s = s.replace(/^\s*(?:\d+\.\s*)?(?:\*\*)?\s*(开场白|开头|寒暄|引子)(?:\*\*)?\s*[:：]/iu, '');

  s = s.replace(/^\s*\d+\.\s*\n+/u, '');

  const bracketMatch = s.match(/^\s*(?:[\s\S]*?)\s*([「『])([\s\S]+?)([」』])\s*$/u);
  if (bracketMatch) {
    s = bracketMatch[2].trim();
  }

  s = s.replace(/\s*\n{3,}/gu, '\n\n').trim();

  return s;
}