import { hideRenderedAnchors, stripTrailingAnchor } from '../views/rendered-anchor';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function text(content: string): Node {
  return { nodeType: TEXT_NODE, textContent: content, childNodes: [] } as unknown as Node;
}

function element(...children: Node[]): Node {
  return { nodeType: ELEMENT_NODE, textContent: '', childNodes: children } as unknown as Node;
}

describe('stripTrailingAnchor', () => {
  it('removes an anchor this plugin wrote', () => {
    expect(stripTrailingAnchor('Buy milk ^tb-a1b2c3d4')).toBe('Buy milk');
  });

  it('removes an anchor carrying the device tag after the prefix', () => {
    expect(stripTrailingAnchor('Buy milk ^tb-dev1a-a1b2c3d4')).toBe('Buy milk');
  });

  it('removes an anchor carrying the device tag after the random part, as older notes still do', () => {
    expect(stripTrailingAnchor('Buy milk ^tb-a1b2c3d4-dev1a')).toBe('Buy milk');
  });

  it('still removes an anchor carrying the prefix minted before `tb-`', () => {
    expect(stripTrailingAnchor('Buy milk ^ots-dev1a-a1b2c3d4')).toBe('Buy milk');
  });

  it('leaves a block id the user wrote themselves alone', () => {
    expect(stripTrailingAnchor('Buy milk ^my-own-anchor')).toBe('Buy milk ^my-own-anchor');
  });

  it('leaves an anchor that is not at the end alone', () => {
    expect(stripTrailingAnchor('^tb-a1b2c3d4 Buy milk')).toBe('^tb-a1b2c3d4 Buy milk');
  });

  it('leaves a caret that is part of the text alone', () => {
    expect(stripTrailingAnchor('Compute 2^8')).toBe('Compute 2^8');
  });

  it('leaves text with no anchor untouched', () => {
    expect(stripTrailingAnchor('Buy milk')).toBe('Buy milk');
  });
});

describe('hideRenderedAnchors', () => {
  it('strips the anchor from a rendered list item', () => {
    const anchorText = text('Buy milk ^tb-a1b2c3d4');
    hideRenderedAnchors(element(element(anchorText)));

    expect(anchorText.textContent).toBe('Buy milk');
  });

  it('reaches an anchor sitting before a nested list', () => {
    const parentText = text('Parent ^tb-a1b2c3d4');
    const childText = text('Child ^tb-e5f6g7h8');
    hideRenderedAnchors(element(element(parentText, element(childText))));

    expect(parentText.textContent).toBe('Parent');
    expect(childText.textContent).toBe('Child');
  });

  it('changes nothing when there is no anchor to hide', () => {
    const plain = text('Just prose');
    hideRenderedAnchors(element(plain));

    expect(plain.textContent).toBe('Just prose');
  });
});
