// Cross-browser clipboard copy that works on iOS Safari
export function copyToClipboard(text) {
  // Try modern API first (must be called synchronously within a user gesture)
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallback(text));
  }
  return Promise.resolve(fallback(text));
}

function fallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;

  // Must remain in viewport and technically "visible" for iOS Safari
  // Use minimal visual footprint instead of hiding off-screen
  textarea.style.position = 'fixed';
  textarea.style.left = '0';
  textarea.style.top = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.background = 'transparent';
  textarea.style.color = 'transparent';
  textarea.style.fontSize = '1px';
  textarea.style.zIndex = '-1';
  // iOS Safari blocks copy on opacity:0 elements — use near-zero instead
  textarea.style.opacity = '0.01';

  document.body.appendChild(textarea);

  // iOS Safari needs contentEditable + readOnly=false + range selection
  const isIOS = /ipad|iphone|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    textarea.contentEditable = 'true';
    textarea.readOnly = false;

    const range = document.createRange();
    range.selectNodeContents(textarea);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    textarea.setSelectionRange(0, text.length);
  } else {
    textarea.select();
  }

  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (e) {
    success = false;
  }

  document.body.removeChild(textarea);
  return success;
}
