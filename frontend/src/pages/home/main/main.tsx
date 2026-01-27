export default function Homebody() {
  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-row flex-wrap justify-center gap-6">
        {/* 중앙 콘텐츠: 모바일에서는 w-full, md 이상에서만 너비 축소 */}
        <div className="flex w-full min-w-0 flex-[0_1_100%] flex-col md:flex-[0_1_100%]">
          {/* 인사 문구 + 밑줄 */}
          <div>
            <h1 className="py-4 text-xl font-semibold md:py-6 md:text-2xl lg:text-3xl">
              <span className="relative inline-block pb-2">
                👋 만나서 반갑습니다. ELFAKA 입니다.
                <span className="absolute -bottom-2 left-0 h-[2px] w-full bg-[#afafff]" />
              </span>
            </h1>
          </div>

          {/* 설명/링크 리스트 */}
          <div>
            <h3 className="text-base leading-relaxed md:text-lg">
              <ul className="space-y-5 md:space-y-6">
                <li>
                  해당 사이트는 그 동안 공부를 한 흔적을 기록하고 토이 프로젝트
                  구축을 위해 만들었습니다.
                </li>
                <li>
                  제 소개는{" "}
                  <a
                    href="/about"
                    className="inline-block rounded-[10px] border border-[#8ee8a1] bg-[#8ee8a144] px-2 py-1 text-sm leading-relaxed no-underline break-words transition hover:border-[#6ddf8c] hover:bg-[#8ee8a166] md:text-base"
                  >
                    About
                  </a>{" "}
                  에 있습니다. (Still Working...)
                </li>
                <li>
                  그동안 풀었던 PS(Problem Solving)은{" "}
                  <a
                    href="/pspost"
                    className="inline-block rounded-[10px] border border-[#8ee8a1] bg-[#8ee8a144] px-2 py-1 text-sm leading-relaxed no-underline break-words transition hover:border-[#6ddf8c] hover:bg-[#8ee8a166] md:text-base"
                  >
                    Solve
                  </a>{" "}
                  에 기록 했습니다.
                </li>
                <li>
                  그동안 개발한 토이 프로젝트 리스트는{" "}
                  <a
                    href="/project"
                    className="inline-block rounded-[10px] border border-[#8ee8a1] bg-[#8ee8a144] px-2 py-1 text-sm leading-relaxed no-underline break-words transition hover:border-[#6ddf8c] hover:bg-[#8ee8a166] md:text-base"
                  >
                    Project
                  </a>{" "}
                  에서 보실 수 있습니다.
                </li>
                <li>
                  정리해야 할 글들은{" "}
                  <a
                    href="/blog"
                    className="inline-block rounded-[10px] border border-[#8ee8a1] bg-[#8ee8a144] px-2 py-1 text-sm leading-relaxed no-underline break-words transition hover:border-[#6ddf8c] hover:bg-[#8ee8a166] md:text-base"
                  >
                    Blog
                  </a>{" "}
                  에 작성 했습니다. (Still Working...)
                </li>
              </ul>
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
}
