/**
 * Stage 5: Wireframe Rendering
 *
 * Converts the ValidatedUISchema into the editor's Page format.
 * Maps the expanded UINodeType to the editor's simpler NodeType.
 * This is the ONLY path from validated schema to editor state.
 */

import { Page, WireframeNode, NodeType } from '@/types/schema';
import { UINode, UINodeType, ValidatedUISchema, StageResult } from '@/types/pipeline';

const TYPE_MAP: Record<UINodeType, NodeType> = {
  'page': 'container',
  'app-shell': 'container',
  'header': 'navbar',
  'topbar': 'navbar',
  'hero': 'container',
  'sidebar': 'sidebar',
  'main-content': 'container',
  'right-panel': 'container',
  'footer': 'navbar',
  'modal-overlay': 'container',
  'section': 'container',
  'container': 'container',
  'hero-content': 'container',
  'feature-grid': 'container',
  'card-grid': 'container',
  'CTA-group': 'container',
  'card': 'card',
  'stat-card': 'card',
  'promo-card': 'card',
  'product-card': 'card',
  'pricing-card': 'card',
  'testimonial-card': 'card',
  'metric-tile': 'card',
  'table': 'table',
  'chart': 'chart',
  'list': 'container',
  'nav-group': 'container',
  'nav-item': 'button',
  'navbar-link': 'button',
  'filter-chip-row': 'container',
  'chip': 'button',
  'button': 'button',
  'icon-button': 'button',
  'input': 'input',
  'search-input': 'input',
  'form': 'container',
  'form-row': 'container',
  'slider': 'input',
  'badge': 'text',
  'avatar': 'image-placeholder',
  'logo': 'image-placeholder',
  'dropdown': 'input',
  'toggle': 'button',
  'tabs': 'container',
  'tab-item': 'button',
  'text': 'text',
  'label': 'text',
  'image-placeholder': 'image-placeholder',
  'divider': 'container',
};

const QUIET_CONTAINER_TYPES = new Set<UINodeType>([
  'container',
  'hero-content',
  'feature-grid',
  'card-grid',
  'CTA-group',
  'list',
  'nav-group',
  'filter-chip-row',
  'form',
  'form-row',
  'tabs',
]);

const ICON_KEYWORDS: Array<[string, string]> = [
  ['search', 'search'],
  ['upgrade', 'sparkles'],
  ['project', 'folder'],
  ['template', 'layout'],
  ['document', 'file-text'],
  ['community', 'users'],
  ['history', 'history'],
  ['setting', 'settings'],
  ['help', 'help-circle'],
  ['attach', 'paperclip'],
  ['voice', 'mic'],
  ['browse', 'compass'],
  ['prompt', 'messages-square'],
  ['image', 'image'],
  ['avatar', 'user-round'],
  ['code', 'code-2'],
  ['chat', 'message-square'],
  ['gift', 'gift'],
  ['home', 'home'],
  ['menu', 'panel-left'],
  ['profile', 'user-round'],
  ['user', 'user-round'],
  ['notification', 'bell'],
  ['send', 'send'],
  ['theme', 'sun-moon'],
  ['light', 'sun'],
  ['dark', 'moon-star'],
  ['new', 'plus'],
  ['create', 'plus'],
  ['write', 'pencil'],
  ['copy', 'pencil'],
  ['avatar', 'user-round'],
  ['generate', 'sparkles'],
  ['summarize', 'file-text'],
  ['browse', 'compass'],
  ['voice', 'mic'],
  ['attach', 'paperclip'],
  ['script', 'sparkles'],
  ['project', 'folder'],
];

/**
 * Convert a UINode to a WireframeNode. All nodes keep absolute
 * page coordinates — Canvas renders them flat on the artboard.
 */
function uiNodeToWireframe(node: UINode): WireframeNode {
  const nodeType = TYPE_MAP[node.type] ?? 'container';
  const styles = parseStyleHints(node.styleHints);

  const metadata: Record<string, unknown> = {
    semanticType: node.type,
  };
  if (node.role) metadata.role = node.role;
  if (node.label) metadata.label = node.label;
  if (node.layoutDirection) metadata.layoutDirection = node.layoutDirection;
  if (node.isRepeated) metadata.isRepeated = node.isRepeated;
  if (node.repeatCount) metadata.repeatCount = node.repeatCount;
  if (node.warnings?.length) metadata.warnings = node.warnings;
  const iconName = inferIconName(node, styles);
  if (iconName) metadata.iconName = iconName;
  if (shouldQuietChrome(node)) metadata.hideChrome = true;
  if (shouldRenderAsIconOnly(node, styles)) metadata.iconOnly = true;
  if (shouldRenderLeadingIcon(node, styles)) metadata.leadingIcon = true;
  if (styles.iconPlacement) metadata.iconPlacement = styles.iconPlacement;
  if (styles.surface) metadata.surface = styles.surface;
  if (styles.emphasis) metadata.emphasis = styles.emphasis;
  if (styles.textAlign) metadata.textAlign = styles.textAlign;
  if (styles.justifyContent) metadata.justifyContent = styles.justifyContent;
  if (styles.alignItems) metadata.alignItems = styles.alignItems;
  if (styles.gap) metadata.gap = styles.gap;
  const paddingH = parsePixelValue(styles.paddingX ?? styles.paddingH);
  const paddingV = parsePixelValue(styles.paddingY ?? styles.paddingV);
  if (paddingH != null) metadata.paddingH = paddingH;
  if (paddingV != null) metadata.paddingV = paddingV;

  return {
    id: node.id,
    type: nodeType,
    x: node.bounds.x,
    y: node.bounds.y,
    width: node.bounds.width,
    height: node.bounds.height,
    text: node.text,
    children: node.children.map(uiNodeToWireframe),
    styles: Object.keys(styles).length > 0 ? styles : undefined,
    metadata,
    confidence: node.confidence,
  };
}

function shouldQuietChrome(node: UINode): boolean {
  return QUIET_CONTAINER_TYPES.has(node.type) && node.children.length > 0;
}

function shouldRenderAsIconOnly(
  node: UINode,
  styles: Record<string, string>,
): boolean {
  return (
    styles.iconPlacement === 'only' ||
    node.type === 'icon-button' ||
    ((node.type === 'button' || node.type === 'toggle' || node.type === 'chip') &&
      !node.text &&
      node.bounds.width <= 52 &&
      node.bounds.height <= 52)
  );
}

function shouldRenderLeadingIcon(
  node: UINode,
  styles: Record<string, string>,
): boolean {
  return (
    styles.iconPlacement === 'leading' ||
    ['nav-item', 'navbar-link', 'button', 'chip', 'icon-button'].includes(node.type) &&
    !!node.text
  );
}

function inferIconName(
  node: UINode,
  styles: Record<string, string>,
): string | undefined {
  if (styles.iconName) return styles.iconName;
  if (styles.icon) return styles.icon;
  if (node.type === 'search-input') return 'search';
  if (node.type === 'dropdown') return 'circle';
  if (node.type === 'toggle') return 'circle';
  if (node.type === 'avatar') return 'user-round';
  if (node.type === 'logo') return 'sparkles';
  if (node.type === 'image-placeholder') return 'image';
  if (node.type === 'icon-button' && !node.text && !node.label) return 'circle';

  const haystack = `${node.label ?? ''} ${node.text ?? ''} ${node.role ?? ''}`.toLowerCase();
  for (const [keyword, iconName] of ICON_KEYWORDS) {
    if (haystack.includes(keyword)) return iconName;
  }

  if (node.type === 'icon-button') return 'circle';
  return undefined;
}

function parseStyleHints(
  styleHints?: string[],
): Record<string, string> {
  const styles: Record<string, string> = {};
  if (!styleHints) return styles;

  for (const hint of styleHints) {
    const [key, ...rest] = hint.split(':');
    if (!key || rest.length === 0) continue;
    const normalizedKey = normalizeStyleKey(key.trim());
    styles[normalizedKey] = rest.join(':').trim();
  }

  return styles;
}

function normalizeStyleKey(key: string): string {
  const compact = key.replace(/[\s_-]/g, '').toLowerCase();
  const aliases: Record<string, string> = {
    paddingx: 'paddingX',
    paddingh: 'paddingH',
    paddinghorizontal: 'paddingX',
    paddingy: 'paddingY',
    paddingv: 'paddingV',
    paddingvertical: 'paddingY',
    borderradius: 'borderRadius',
    fontsize: 'fontSize',
    fontweight: 'fontWeight',
    textalign: 'textAlign',
    alignitems: 'alignItems',
    justifycontent: 'justifyContent',
    iconname: 'iconName',
    iconplacement: 'iconPlacement',
    bordercolor: 'borderColor',
    borderwidth: 'borderWidth',
    borderstyle: 'borderStyle',
    backgroundcolor: 'backgroundColor',
  };
  return aliases[compact] ?? key.trim();
}

function parsePixelValue(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

export function renderToPage(
  validated: ValidatedUISchema,
  pageName: string = 'Home',
  pageId: string = 'page-1',
): StageResult<Page> {
  const start = Date.now();

  try {
    const children = validated.root.children.map((n) => uiNodeToWireframe(n));

    const page: Page = {
      id: pageId,
      name: pageName,
      width: validated.pageWidth,
      height: validated.pageHeight,
      children,
    };

    console.log(
      `[Stage 5] Rendered Page (${validated.pageWidth}x${validated.pageHeight}): ${children.length} top-level blocks in ${Date.now() - start}ms`,
    );

    function logTree(nodes: WireframeNode[], indent = '') {
      for (const n of nodes) {
        console.log(`${indent}[${n.type}] "${n.text?.slice(0, 20) || ''}" @ (${n.x}, ${n.y}) ${n.width}x${n.height}`);
        if (n.children.length > 0) logTree(n.children, indent + '  ');
      }
    }
    logTree(children);

    return {
      stage: 'render',
      data: page,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Stage 5] Error:', message);
    return {
      stage: 'render',
      data: {
        id: pageId,
        name: pageName,
        width: validated.pageWidth,
        height: validated.pageHeight,
        children: [],
      },
      durationMs: Date.now() - start,
      error: `Stage 5 failed: ${message}`,
    };
  }
}
