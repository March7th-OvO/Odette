import { useState } from 'react';
import { Check, Copy, Code } from 'lucide-react';
export function CopyButton({ value, markdown = false }: { value: string; markdown?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return <button className="copy-button" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setFailed(false); setTimeout(() => setCopied(false), 1800); }
    catch { setFailed(true); }
  }} title={failed ? '复制失败，请在预览中手动复制链接' : undefined}>
    {copied ? <Check size={14}/> : markdown ? <Code size={14}/> : <Copy size={14}/>}{failed ? '复制失败' : copied ? '已复制' : markdown ? 'Markdown' : '链接'}
  </button>;
}
