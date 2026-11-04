import type { BookingRequest } from "@/api/flights";

/**
 * 판매처로 이동.
 *
 * SerpApi 가 주는 이동 정보는 Google 중계 주소(`https://www.google.com/travel/clk/f`) + 폼 본문(`u=...`)이다.
 * 이 본문을 그 주소로 **POST** 해야 Google 이 판매처 예약 페이지로 보내 준다. 링크(GET)로는 열리지 않으므로
 * 숨은 폼을 만들어 새 탭으로 전송한다. 본문이 없으면 판매처 주소로 바로 연다.
 *
 * 클릭 이벤트 안에서 불러야 팝업 차단에 걸리지 않는다.
 */
export function openBooking(request: BookingRequest): void {
  if (!request.postData) {
    window.open(request.url, "_blank", "noopener,noreferrer");
    return;
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = request.url;
  form.target = "_blank";
  form.rel = "noopener noreferrer";
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
