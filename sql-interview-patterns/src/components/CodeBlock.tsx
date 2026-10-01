import { useRef, useState } from 'react';
import { highlight } from '../lib/sqlHighlight';

export function CodeBlock({ code }: { code: string }) {
  const [label, setLabel] = useState<'idle' | 'copied' | 'selected'>('idle');
  const preRef = useRef<HTMLPreElement>(null);

  /** Some embeddings refuse clipboard writes; select the SQL instead so the
   *  reader can copy it by hand rather than getting a button that does nothing. */
  const selectInstead = () => {
    const pre = preRef.current;
    if (!pre) return;
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    setLabel('selected');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setLabel('copied');
    } catch {
      selectInstead();
    }
    setTimeout(() => setLabel('idle'), 1800);
  };

  return (
    <div className="code">
      <button className="copy" onClick={copy} type="button">
        {label === 'copied' ? 'Copied' : label === 'selected' ? 'Selected — press ⌘C' : 'Copy'}
      </button>
      <pre ref={preRef}>
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      </pre>
    </div>
  );
}
