'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Page, ElementOverride, SelectedElementInfo, CodeNode } from '@/types/schema';
import { useEditorStore } from '@/store/editorStore';

// ── Selection + hover runtime injected into every iframe ────
const SELECTION_RUNTIME = `
<script>
(function() {
  var _sel = null;

  // Commands from parent → iframe
  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.__unclash) return;
    var msg = e.data;

    if (msg.type === 'select') {
      if (_sel) {
        var prev = document.querySelector('[data-unclash-id="' + _sel + '"]');
        if (prev) prev.style.outline = '';
      }
      _sel = msg.id || null;
      if (_sel) {
        var el = document.querySelector('[data-unclash-id="' + _sel + '"]');
        if (el) el.style.outline = '2px solid #589df6';
      }
    }

    if (msg.type === 'update-style') {
      var el = document.querySelector('[data-unclash-id="' + msg.id + '"]');
      if (el && msg.styles) {
        Object.assign(el.style, msg.styles);
      }
    }

    if (msg.type === 'update-text') {
      var el = document.querySelector('[data-unclash-id="' + msg.id + '"]');
      if (!el) return;
      var textNodes = Array.from(el.childNodes).filter(function(n) { return n.nodeType === 3; });
      if (textNodes.length > 0) {
        textNodes[0].textContent = msg.text;
      }
    }
  });

  // Notify parent when React has rendered (elements are visible)
  function attachHandlers() {
    if (!document.querySelector('[data-unclash-id]')) {
      setTimeout(attachHandlers, 100);
      return;
    }

    // Build and send DOM tree to parent
    function buildTree(el) {
      var node = { id: el.dataset.unclashId, tagName: el.tagName.toLowerCase(), children: [] };
      var allDescendants = Array.from(el.querySelectorAll('[data-unclash-id]'));
      var directChildren = allDescendants.filter(function(child) {
        var p = child.parentElement;
        while (p && p !== el) {
          if (p.dataset && p.dataset.unclashId) return false;
          p = p.parentElement;
        }
        return true;
      });
      node.children = directChildren.map(buildTree);
      return node;
    }
    var allAnnotated = Array.from(document.querySelectorAll('[data-unclash-id]'));
    var roots = allAnnotated.filter(function(el) {
      var p = el.parentElement;
      while (p && p !== document.documentElement) {
        if (p.dataset && p.dataset.unclashId) return false;
        p = p.parentElement;
      }
      return true;
    });
    window.parent.postMessage({
      __unclash: true,
      type: 'dom-tree',
      nodes: roots.map(buildTree),
    }, '*');

    document.addEventListener('click', function(e) {
      var el = e.target;
      while (el && el !== document.documentElement) {
        if (el.dataset && el.dataset.unclashId) {
          e.preventDefault();
          e.stopPropagation();
          var rect = el.getBoundingClientRect();
          var cs = window.getComputedStyle(el);
          var directText = Array.from(el.childNodes)
            .filter(function(n) { return n.nodeType === 3; })
            .map(function(n) { return n.textContent || ''; })
            .join('').trim();
          window.parent.postMessage({
            __unclash: true,
            type: 'element-selected',
            id: el.dataset.unclashId,
            tagName: el.tagName.toLowerCase(),
            className: el.getAttribute('class') || '',
            rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
            styles: {
              backgroundColor: cs.backgroundColor,
              color: cs.color,
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              borderRadius: cs.borderRadius,
              width: rect.width,
              height: rect.height,
            },
            textContent: directText,
          }, '*');
          return;
        }
        el = el.parentElement;
      }
      window.parent.postMessage({ __unclash: true, type: 'element-deselected' }, '*');
    }, true);

    document.addEventListener('mouseover', function(e) {
      var el = e.target;
      while (el && el !== document.documentElement) {
        if (el.dataset && el.dataset.unclashId) {
          if (el.dataset.unclashId !== _sel) {
            el.style.outline = '1px dashed rgba(88,157,246,0.45)';
          }
          return;
        }
        el = el.parentElement;
      }
    });

    document.addEventListener('mouseout', function(e) {
      var el = e.target;
      while (el && el !== document.documentElement) {
        if (el.dataset && el.dataset.unclashId) {
          if (el.dataset.unclashId !== _sel) {
            el.style.outline = '';
          }
          return;
        }
        el = el.parentElement;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(attachHandlers, 200); });
  } else {
    setTimeout(attachHandlers, 200);
  }
})();
</script>`;

// Build CSS block from element overrides
function buildOverrideStyles(overrides: Record<string, ElementOverride>): string {
  const rules = Object.entries(overrides)
    .map(([id, o]) => {
      const props: string[] = [];
      if (o.backgroundColor) props.push(`background-color: ${o.backgroundColor} !important`);
      if (o.color) props.push(`color: ${o.color} !important`);
      if (o.fontSize) props.push(`font-size: ${o.fontSize} !important`);
      if (o.fontWeight) props.push(`font-weight: ${o.fontWeight} !important`);
      if (o.borderRadius) props.push(`border-radius: ${o.borderRadius} !important`);
      if (o.width) props.push(`width: ${o.width} !important`);
      if (o.height) props.push(`height: ${o.height} !important`);
      if (o.padding) props.push(`padding: ${o.padding} !important`);
      return props.length > 0
        ? `[data-unclash-id="${id}"] { ${props.join('; ')}; }`
        : '';
    })
    .filter(Boolean)
    .join('\n');

  return rules ? `<style id="unclash-overrides">\n${rules}\n</style>` : '';
}

// Build text-override JS
function buildTextOverrideScript(overrides: Record<string, ElementOverride>): string {
  const ops = Object.entries(overrides)
    .filter(([, o]) => o.textContent !== undefined)
    .map(([id, o]) => {
      const escaped = (o.textContent ?? '').replace(/'/g, "\\'");
      return `  applyText('${id}', '${escaped}');`;
    })
    .join('\n');

  if (!ops) return '';
  return `<script>
(function() {
  function applyText(id, text) {
    var el = document.querySelector('[data-unclash-id="' + id + '"]');
    if (!el) return;
    var nodes = Array.from(el.childNodes).filter(function(n) { return n.nodeType === 3; });
    if (nodes.length > 0) { nodes[0].textContent = text; return; }
    if (el.children.length === 0) el.textContent = text;
  }
  // Wait for React to render
  function run() {
    if (document.querySelector('[data-unclash-id]')) {
${ops}
    } else { setTimeout(run, 100); }
  }
  setTimeout(run, 300);
})();
<\/script>`;
}

function buildSrcdoc(code: string, overrides: Record<string, ElementOverride>): string {
  const overrideCss = buildOverrideStyles(overrides);
  const overrideJs = buildTextOverrideScript(overrides);

  // Escape </script> in the user code so it can't break out of the text/plain block
  const safeCode = code.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
    [data-unclash-id] { cursor: pointer; }
  </style>
  ${overrideCss}
</head>
<body>
  ${SELECTION_RUNTIME}
  <div id="root"></div>
  <script id="app-code" type="text/plain">${safeCode}<\/script>
  <script type="module">
    import React from 'https://esm.sh/react@18';
    import { createRoot } from 'https://esm.sh/react-dom@18/client';
    import * as lucide from 'https://esm.sh/lucide-react?deps=react@18,react-dom@18';
    window.React = React;
    window.ReactDOM = { createRoot };
    window.lucide = lucide;
    const src = document.getElementById('app-code').textContent;
    try {
      const js = Babel.transform(src, { presets: ['react'] }).code;
      const s = document.createElement('script');
      s.textContent = js + '\\nReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));';
      document.body.appendChild(s);
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<pre style="padding:16px;color:#ef4444;font-size:11px;white-space:pre-wrap">Render error:\\n' + (err && err.message || String(err)) + '<\\/pre>';
    }
  <\/script>
  ${overrideJs}
</body>
</html>`;
}

interface Props {
  page: Page;
}

export default function CodeFrame({ page }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { setSelectedElement, setCodeNodes, selectedElementId, currentPageId } = useEditorStore();

  const srcdoc = useMemo(
    () => buildSrcdoc(page.code ?? '', page.elementOverrides ?? {}),
    [page.code, page.elementOverrides],
  );

  // Listen for postMessages from this specific iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data?.__unclash) return;
      if (e.source !== iframeRef.current?.contentWindow) return;

      const msg = e.data as { type: string; id?: string; [key: string]: unknown };

      if (msg.type === 'element-selected') {
        const info: SelectedElementInfo = {
          tagName: msg.tagName as string,
          className: msg.className as string,
          styles: msg.styles as SelectedElementInfo['styles'],
          textContent: msg.textContent as string,
        };
        setSelectedElement(msg.id ?? null, info);
      }

      if (msg.type === 'element-deselected') {
        setSelectedElement(null);
      }

      if (msg.type === 'dom-tree') {
        setCodeNodes((msg.nodes as CodeNode[]) ?? []);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setSelectedElement]);

  // Sync selection highlight into the iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      { __unclash: true, type: 'select', id: selectedElementId },
      '*',
    );
  }, [selectedElementId]);

  // Clear selection when switching pages
  useEffect(() => {
    if (currentPageId !== page.id) {
      setSelectedElement(null);
    }
  }, [currentPageId, page.id, setSelectedElement]);

  return (
    <iframe
      ref={iframeRef}
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      srcDoc={srcdoc}
      title={`canvas-${page.id}`}
    />
  );
}
