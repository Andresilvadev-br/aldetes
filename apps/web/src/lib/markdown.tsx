import { Fragment, type ReactNode } from 'react';
import { get, displayName, memberColor } from '@/store';

/**
 * Safe markdown subset → React elements (never HTML strings, so no XSS):
 * **bold**, *italic*, __underline__, ~~strike~~, `code`, ```blocks```, > quotes, ||spoiler||,
 * autolinks, <@user>, <@&role>, <#channel>, <:name:id> custom emoji, @everyone/@here.
 */
export interface RenderCtx {
  serverId: string | null;
  onUser?: (id: string, el: HTMLElement) => void;
  onChannel?: (id: string) => void;
}

const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]]/;

type Rule = { re: RegExp; render: (m: RegExpExecArray, ctx: RenderCtx, key: string) => ReactNode };

const inlineRules: Rule[] = [
  { re: /^`([^`\n]+)`/, render: (m, _c, k) => <code key={k} className="rounded bg-bg-rail px-1 py-0.5 font-mono text-[0.85em]">{m[1]}</code> },
  { re: /^\*\*([\s\S]+?)\*\*/, render: (m, c, k) => <strong key={k}>{inline(m[1]!, c, k)}</strong> },
  { re: /^__([\s\S]+?)__/, render: (m, c, k) => <u key={k}>{inline(m[1]!, c, k)}</u> },
  { re: /^\*([^*\n]+?)\*/, render: (m, c, k) => <em key={k}>{inline(m[1]!, c, k)}</em> },
  { re: /^_([^_\n]+?)_(?![a-zA-Z0-9])/, render: (m, c, k) => <em key={k}>{inline(m[1]!, c, k)}</em> },
  { re: /^~~([\s\S]+?)~~/, render: (m, c, k) => <s key={k}>{inline(m[1]!, c, k)}</s> },
  { re: /^\|\|([\s\S]+?)\|\|/, render: (m, c, k) => <Spoiler key={k}>{inline(m[1]!, c, k)}</Spoiler> },
  {
    re: /^<@!?(\d{1,20})>/,
    render: (m, c, k) => {
      const id = m[1]!;
      return (
        <span
          key={k}
          className="cursor-pointer rounded bg-brand/25 px-0.5 font-medium text-brand hover:bg-brand hover:text-white"
          onClick={(e) => c.onUser?.(id, e.currentTarget)}
        >
          @{displayName(id, c.serverId)}
        </span>
      );
    },
  },
  {
    re: /^<@&(\d{1,20})>/,
    render: (m, c, k) => {
      const role = c.serverId ? get().roles[c.serverId]?.[m[1]!] : undefined;
      const color = role?.color ?? undefined;
      return (
        <span key={k} className="rounded px-0.5 font-medium" style={{ color: color ?? 'rgb(var(--brand))', background: color ? `${color}33` : 'rgb(var(--brand) / .25)' }}>
          @{role?.name ?? 'cargo-desconhecido'}
        </span>
      );
    },
  },
  {
    re: /^<#(\d{1,20})>/,
    render: (m, c, k) => {
      const ch = get().channels[m[1]!];
      return (
        <span key={k} className="cursor-pointer rounded bg-brand/25 px-0.5 font-medium text-brand hover:bg-brand hover:text-white" onClick={() => c.onChannel?.(m[1]!)}>
          #{ch?.name ?? 'canal-desconhecido'}
        </span>
      );
    },
  },
  {
    re: /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{1,20})>/,
    render: (m, c, k) => {
      const list = c.serverId ? (get().emojis[c.serverId] ?? []) : Object.values(get().emojis).flat();
      const e = list.find((x) => x.id === m[3]);
      return e ? <img key={k} src={e.url} alt={`:${m[2]}:`} title={`:${m[2]}:`} className="inline-block h-[1.375em] w-[1.375em] object-contain align-bottom" /> : <Fragment key={k}>:{m[2]}:</Fragment>;
    },
  },
  { re: /^@(everyone|here)\b/, render: (m, _c, k) => <span key={k} className="rounded bg-brand/25 px-0.5 font-medium text-brand">@{m[1]}</span> },
  {
    re: new RegExp('^' + URL_RE.source),
    render: (m, _c, k) => (
      <a key={k} href={m[0]} target="_blank" rel="noopener noreferrer nofollow" className="text-[#4aa8ff] hover:underline">
        {m[0]}
      </a>
    ),
  },
];

const SPECIAL = /[`*_~|<@h\\]/;

export function inline(text: string, ctx: RenderCtx, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let n = 0;
  outer: while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\' && i + 1 < text.length && /[`*_~|<@\\]/.test(text[i + 1]!)) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (SPECIAL.test(ch)) {
      const rest = text.slice(i);
      for (const rule of inlineRules) {
        const m = rule.re.exec(rest);
        if (m) {
          if (buf) out.push(buf);
          buf = '';
          out.push(rule.render(m, ctx, `${keyPrefix}-${n++}`));
          i += m[0].length;
          continue outer;
        }
      }
    }
    buf += ch;
    i++;
  }
  if (buf) out.push(buf);
  return out;
}

export function renderMarkdown(src: string, ctx: RenderCtx): ReactNode {
  const blocks: ReactNode[] = [];
  const parts = src.split(/(```[\s\S]*?```)/g);
  let k = 0;
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
      const body = part.slice(3, -3).replace(/^[a-zA-Z0-9+-]*\n/, '');
      blocks.push(
        <pre key={k++} className="scroll-thin my-1 max-w-full overflow-x-auto rounded border border-black/30 bg-bg-rail p-2 font-mono text-[0.85em] leading-snug">
          <code>{body}</code>
        </pre>,
      );
      continue;
    }
    const lines = part.split('\n');
    let quote: string[] = [];
    const flushQuote = () => {
      if (!quote.length) return;
      blocks.push(
        <blockquote key={k++} className="my-0.5 border-l-4 border-fg-faint/60 pl-3">
          {quote.map((q, i) => (
            <div key={i}>{q ? inline(q, ctx, `q${k}-${i}`) : ' '}</div>
          ))}
        </blockquote>,
      );
      quote = [];
    };
    lines.forEach((line, li) => {
      if (line.startsWith('> ') || line === '>') {
        quote.push(line.slice(2));
        return;
      }
      flushQuote();
      const h = /^(#{1,3}) (.+)/.exec(line);
      if (h) {
        const cls = h[1]!.length === 1 ? 'text-2xl' : h[1]!.length === 2 ? 'text-xl' : 'text-lg';
        blocks.push(
          <div key={k++} className={`${cls} my-1 font-bold text-fg-strong`}>
            {inline(h[2]!, ctx, `h${k}`)}
          </div>,
        );
        return;
      }
      const isLast = li === lines.length - 1;
      blocks.push(
        <Fragment key={k++}>
          {inline(line, ctx, `l${k}`)}
          {!isLast && <br />}
        </Fragment>,
      );
    });
    flushQuote();
  }
  return blocks;
}

function Spoiler({ children }: { children: ReactNode }) {
  return (
    <span
      className="cursor-pointer rounded bg-fg-faint px-0.5 text-transparent transition-colors [&.open]:bg-fg/10 [&.open]:text-inherit"
      onClick={(e) => e.currentTarget.classList.add('open')}
    >
      {children}
    </span>
  );
}

/** Only emoji (≤ 27 chars, no letters) → render large. */
export function isJumbo(text: string) {
  const t = text.trim();
  return t.length > 0 && t.length <= 27 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|<a?:\w+:\d+>|\s)+$/u.test(t);
}

export function firstUrl(text: string): string | null {
  return URL_RE.exec(text)?.[0] ?? null;
}

export { memberColor };
