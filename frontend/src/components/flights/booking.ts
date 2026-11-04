import type { BookingRequest } from "@/api/flights";

/**
 * 판매처로 이동.
 *
 * SerpApi 가 주는 이동 정보는 Google 중계 주소(`https://www.google.com/travel/clk/f`) + 폼 본문(`u=...`)이다.
 * 이 본문을 그 주소로 **POST** 해야 Google 이 판매처 예약 페이지로 보내 준다. 링크(GET)로는 열리지 않으므로
 * 숨은 폼을 만들어 전송한다. 본문이 없으면 판매처 주소로 바로 연다.
 *
 * `target="_blank"` 폼은 일부 환경(앱 내 브라우저 등)에서 POST 본문 없이 GET 으로 열리거나 막힌다.
 * 그래서 이름 붙인 빈 탭을 먼저 열고 그 탭으로 폼을 보낸다. 팝업이 막히면 지금 탭에서 이동한다
 * (검색 결과는 30분 캐시라 돌아와 다시 검색해도 한도를 쓰지 않는다).
 *
 * 클릭 이벤트 안에서 불러야 팝업 차단에 걸리지 않는다.
 */
export function openBooking(request: BookingRequest): void {
  if (!request.postData) {
    window.open(request.url, "_blank", "noopener,noreferrer");
    return;
  }

  const name = `flight-booking-${Date.now()}`;
  const tab = window.open("about:blank", name);
  if (tab) {
    // 판매처 페이지가 window.opener 로 이 화면을 조작하지 못하게 끊는다
    try {
      tab.opener = null;
    } catch {
      // 일부 브라우저는 opener 를 바꿀 수 없다 — 이동에는 지장 없다
    }
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = request.url;
  form.target = tab ? name : "_self";
  form.style.display = "none";

  for (const [name, value] of parsePostData(request.postData)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/**
 * 폼 인코딩 문자열 → [이름, 값] 목록.
 * 브라우저가 폼을 보낼 때 다시 인코딩하므로 여기서는 한 번 풀어 둔다 (`+` 는 공백).
 */
export function parsePostData(postData: string): [string, string][] {
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, " "));
    } catch {
      return s;
    }
  };

  return postData
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq < 0 ? [decode(pair), ""] : [decode(pair.slice(0, eq)), decode(pair.slice(eq + 1))];
    });
}
