import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Header } from '../../src/web/components/Header.js';

describe('Header', () => {
  it('shows the connection details previously displayed in the footer', () => {
    const markup = renderToStaticMarkup(createElement(Header, {
      connection: {
        status: 'connected',
        userAgent: 'thread-scope/test-client',
      },
      onThemeChange: () => {},
      theme: 'auto',
    }));

    expect(markup).toContain('Connected');
    expect(markup).toContain('Desktop snapshots · near real-time');
    expect(markup).toContain('thread-scope/test-client');
    expect(markup).toContain('127.0.0.1');
    expect(markup).toContain('Theme: System. Switch to Light');
  });
});
