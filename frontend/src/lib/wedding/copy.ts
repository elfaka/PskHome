/**
 * 클립보드 복사. 카카오톡 등 인앱 브라우저나 비 HTTPS 에서는 Clipboard API 가 없거나 거부되므로
 * 숨긴 textarea + execCommand 로 한 번 더 시도한다. 둘 다 실패하면 false.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부 등 — 아래 폴백으로 넘어간다
  }

  const ta = document.createElement("textarea");
  try {
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    // iOS 는 16px 미만이면 포커스 때 화면을 확대한다
    ta.style.fontSize = "16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS Safari 는 select() 만으로 선택되지 않는다
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}
