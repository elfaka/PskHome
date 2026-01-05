import elfaka from "../../../assets/elfaka.png";
import github from "../../../assets/github.svg";

export default function Homeheader() {
  return (
    <div className="relative z-[100] bg-white px-4 py-3 shadow-md sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 sm:gap-6">
        {/* 로고 */}
        <a href="/" className="flex items-center">
          <img
            src={elfaka}
            className="h-8 w-auto sm:h-10 md:h-12 transition-transform duration-300 ease-in-out hover:scale-110"
          />
        </a>

        {/* GitHub 아이콘 */}
        <a
          href="https://github.com/elfaka"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center"
        >
          <img
            src={github}
            className="h-7 w-7 sm:h-8 sm:w-8 transition-transform duration-300 ease-in-out hover:scale-110"
          />
        </a>
      </div>
    </div>
  );
}
