/**
 * /trader 2단계 인증(Google Authenticator) 비밀키 만들기.
 *
 *   npm run trader:totp-setup
 *
 * 1. 새 비밀키를 만들어 보여 준다 → Google Authenticator 의 "설정 키 입력"에 넣는다
 *    (계정 이름: 아무거나, 키 유형: 시간 기준)
 * 2. 앱에 뜬 6자리 코드를 입력해 맞는지 확인한다
 * 3. 확인되면 비밀키를 GitHub Secret TRADER_TOTP_SECRET 에 넣는다 (저장소·채팅에 남기지 않는다)
 *
 * 비밀키는 이 화면에만 나온다. 다시 볼 수 없으니 등록을 마친 뒤 터미널을 지운다.
 */
import { createInterface } from "node:readline/promises";

import { generateSecret, otpauthUri, parseSecret, verifyTotp } from "../src/modules/trader/totp.js";

const secret = generateSecret();
const key = parseSecret(secret)!;
const grouped = secret.match(/.{1,4}/g)!.join(" ");

process.stdout.write(`
Google Authenticator → (+) → "설정 키 입력"
  계정 이름 : PskHome Trader
  내 키     : ${grouped}
  키 유형   : 시간 기준

QR 을 만들 수 있는 다른 인증 앱이면 이 주소를 써도 된다:
  ${otpauthUri(secret, "owner")}

`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
for (let attempt = 1; attempt <= 3; attempt++) {
  const code = (await rl.question("앱에 뜬 6자리 코드: ")).replace(/\s/g, "");
  if (verifyTotp(key, code, Date.now()) !== null) {
    rl.close();
    process.stdout.write(`
확인됐다. 아래 값을 GitHub Secret TRADER_TOTP_SECRET 에 넣고 Backend Deploy 를 다시 실행한다.

${secret}

`);
    process.exit(0);
  }
  process.stdout.write("맞지 않는다. 휴대폰 시간이 자동 설정인지 확인하고 다음 코드로 다시 입력한다.\n");
}
rl.close();
process.stdout.write("세 번 틀렸다. 앱에서 방금 추가한 항목을 지우고 처음부터 다시 한다.\n");
process.exit(1);
