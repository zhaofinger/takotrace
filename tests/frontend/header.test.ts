import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Header } from '../../src/web/components/Header.js';

describe('Header', () => {
  it('keeps diagnostics behind the connection disclosure', () => {
    const markup = renderToStaticMarkup(createElement(Header, {
      connection: {
        status: 'connected',
        userAgent: 'thread-scope/test-client',
      },
      onSelectThread: () => {},
      onSelectTurn: () => {},
      onThemeChange: () => {},
      theme: 'auto',
      threads: [],
    }));

    expect(markup).toContain('Connected');
    expect(markup).toContain('Desktop snapshots · near real-time');
    expect(markup).toContain('thread-scope/test-client');
    expect(markup).toContain('class="vbg-custom-topbar__connection"');
    expect(markup).toContain('title="Connection details"');
    expect(markup).not.toContain('vbg-custom-topbar__divider');
    expect(markup).toContain('Theme: System. Switch to Light');
    expect(markup).toContain('placeholder="Search sessions and runs…"');
    expect(markup).toContain('Search sessions and loaded runs');
  });

  it('keeps connection errors visible and inspectable', () => {
    const markup = renderToStaticMarkup(createElement(Header, {
      connection: {
        status: 'disconnected',
        error: 'Unable to reach the local app server',
      },
      onSelectThread: () => {},
      onSelectTurn: () => {},
      onThemeChange: () => {},
      theme: 'dark',
      threads: [],
    }));

    expect(markup).toContain('Disconnected');
    expect(markup).toContain('title="Unable to reach the local app server"');
    expect(markup).toContain('class="vbg-custom-topbar__error"');
  });
});
