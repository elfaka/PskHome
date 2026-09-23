import { Sprig } from "./Ornaments";

/** 한글 소제목 + 영문 스크립트 제목. 스크린리더는 한글 → 영문 순으로 읽는다. */
export default function SectionHeading({
  label,
  script,
}: {
  label: string;
  script: string;
}) {
  return (
    <div className="text-center">
      <h2>
        <span className="block text-xs font-medium tracking-[0.35em] text-wd-sage-deep">
          {label}
        </span>
        <span lang="en" className="wd-title mt-2 block font-wd-script leading-[1.1] text-wd-ink">
          {script}
        </span>
      </h2>
      <Sprig className="mx-auto mt-4 w-24 text-wd-sage" />
    </div>
  );
}
