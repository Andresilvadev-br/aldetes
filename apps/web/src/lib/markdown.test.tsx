import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown, isJumbo } from './markdown';
import { set, initialState } from '@/store';
import { encodeMentions } from '@/components/chat/Composer';

const html = (s: string) => renderToStaticMarkup(<>{renderMarkdown(s, { serverId: 's1' })}</>);

beforeEach(() => {
  set({
    ...initialState,
    me: { id: 'u1', username: 'ana', displayName: 'Ana' } as never,
    users: { '222': { id: '222', username: 'bruno', displayName: 'Bruno' } as never },
    members: { s1: { u1: { userId: 'u1', user: { id: 'u1', username: 'ana' } } as never, '222': { userId: '222', user: { id: '222', username: 'bruno' }, nickname: null, roleIds: [] } as never } },
    roles: { s1: { '333': { id: '333', name: 'Mods', color: '#ff0000', isEveryone: false } as never } },
    channels: { '444': { id: '444', serverId: 's1', name: 'geral', type: 'text' } as never },
  });
});

describe('markdown seguro', () => {
  it('nunca injeta HTML (XSS)', () => {
    const out = html('<img src=x onerror=alert(1)> <script>alert(1)</script>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;img');
  });
  it('links só http(s) e com rel seguro', () => {
    const out = html('veja https://exemplo.com/a?b=1 e javascript:alert(1)');
    expect(out).toContain('href="https://exemplo.com/a?b=1"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).not.toContain('href="javascript');
  });
  it('formatação básica', () => {
    expect(html('**negrito** *itálico* ~~riscado~~ `código`')).toMatch(/<strong>negrito<\/strong>.*<em>itálico<\/em>.*<s>riscado<\/s>.*<code[^>]*>código<\/code>/);
    expect(html('```\n<b>x</b>\n```')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('menções de usuário, cargo e canal', () => {
    const out = html('<@222> <@&333> <#444>');
    expect(out).toContain('@Bruno');
    expect(out).toContain('@Mods');
    expect(out).toContain('#geral');
  });
  it('emoji grande só quando a mensagem tem apenas emojis', () => {
    expect(isJumbo('😀🎉')).toBe(true);
    expect(isJumbo('oi 😀')).toBe(false);
  });
});

describe('encodeMentions', () => {
  it('converte @usuario, @cargo e #canal, preservando código', () => {
    expect(encodeMentions('oi @bruno e @mods em #geral `@bruno`', 's1', '444')).toBe('oi <@222> e <@&333> em <#444> `@bruno`');
  });
  it('mantém texto de nomes desconhecidos', () => {
    expect(encodeMentions('@ninguem', 's1', '444')).toBe('@ninguem');
  });
});
