// Cross-browser clipboard copy that works on iOS Safari
export function copyToClipboard(text) {
  // Try modern API first
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallback(text));
  }
  return Promise.resolve(fallback(text));
}

function fallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  // iOS Safari needs special handling
  if (navigator.userAgent.match(/ipad|iphone/i)) {
    textarea.contentEditable = true;
    textarea.readOnly = false;
    const range = document.createRange();
    range.selectNodeContents(textarea);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    textarea.setSelectionRange(0, 999999);
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
