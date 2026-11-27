/**
 * /trader 로그인 비밀번호 해시 생성기.
 *
 *   npm run trader:hash-password             해시 만들기
 *   npm run trader:hash-password -- --verify 가지고 있는 해시와 비밀번호가 맞는지 확인
 *
 * 비밀번호는 셸 기록에 남지 않도록 인자가 아니라 표준입력으로 받는다.
 * 출력된 해시를 TRADER_ADMIN_PASSWORD_HASH 에 넣는다 (평문은 어디에도 저장하지 않는다).
 */
import { hashPassword, verifyLogin } from "../src/modules/trader/traderAuth.service.js";

/**
 * 터미널에서 한 줄 읽는다. hidden 이면 글자 대신 * 를 보여 준다.
 * readline 의 내부 메서드(_writeToOutput)는 Node 버전마다 달라서(Node 24 에는 없다)
 * raw 모드로 직접 읽는다.
 */
function ask(prompt: string, hidden: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(prompt);
    let value = "";
    let escape = false;
    const done = (err?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (escape) {
          // 방향키 등 ESC [ X 형태는 글자로 넣지 않는다
          if (/[A-Za-z~]/.test(ch)) escape = false;
          continue;
        }
        if (ch === "\u001b") {
          escape = true;
        } else if (ch === "\r" || ch === "\n") {
          return done();
        } else if (ch === "\u0003") {
          return done(new Error("취소했다")); // Ctrl+C
        } else if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = [...value].slice(0, -1).join("");
            process.stderr.write("\b \b");
          }
        } else if (ch >= " ") {
          value += ch;
          process.stderr.write(hidden ? "*" : ch);
        }
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

/** 로그인 화면에서 그대로 칠 수 있는 글자인지 (한/영 키가 한글 상태면 여기서 걸린다). */
function checkTypable(pw: string) {
  if (!/^[\x20-\x7e]+$/.test(pw)) {
    throw new Error(
      "영문·숫자·기호(ASCII)만 쓸 수 있다. 한/영 키가 한글 상태였는지 확인하고 다시 입력한다"
    );
  }
}

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function readNewPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readStdinAll();
  const a = await ask("비밀번호 (12자 이상): ", true);
  checkTypable(a);
  const b = await ask("한 번 더: ", true);
  if (a !== b) throw new Error("두 입력이 다르다");
  return a;
}

async function verify() {
  if (!process.stdin.isTTY) throw new Error("--verify 는 터미널에서 실행한다");
  const hash = (await ask("해시 (scrypt:... 붙여넣기): ", false)).trim();
  const pw = await ask("비밀번호: ", true);
  const ok = await verifyLogin({ username: "u", passwordHash: hash }, "u", pw);
  process.stdout.write(
    ok ? "일치한다\n" : "일치하지 않는다 (해시가 잘렸거나 비밀번호가 다르다)\n"
  );
}

if (process.argv.includes("--verify")) {
  await verify();
} else {
  const hash = await hashPassword(await readNewPassword());
  process.stdout.write(`${hash}\n`);
}
