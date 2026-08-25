import { THEME_STORAGE_KEY } from "./theme";

/**
 * 첫 페인트 전에 `<html data-theme>` 을 세팅하는 blocking 스크립트.
 *
 * 이게 없으면 서버가 보낸 HTML 이 라이트로 그려진 뒤 hydration 이 끝나야 다크로
 * 바뀌어서 흰 화면이 한 번 번쩍인다(플래시). 그래서 React 밖에서, 동기적으로 돈다.
 *
 * 스크립트가 실패해도(프라이빗 모드 등에서 localStorage 접근 차단) 앱은 떠야 하므로
 * 전체를 try/catch 로 감싸고 실패 시 light 로 둔다.
 */
export default function ThemeScript() {
  const script = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||((!p||p==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
