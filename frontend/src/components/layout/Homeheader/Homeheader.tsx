import elfaka from "../../../assets/elfaka.png";
import github from "../../../assets/github.svg";
import "./Homeheader.css";

export default function Homeheader() {
  return (
    <div className="homeheader-appbar">
      <div className="homeheader-container">
        <div className="homeheader-spacer" />
        <div className="homeheader-logo">
          <a href="/">
            <img src={elfaka} width="150px" className="hover-img" />
          </a>
        </div>
        <div className="homeheader-github">
          <a href="https://github.com/elfaka">
            <img src={github} width="40px" className="hover-img" />
          </a>
        </div>
        <div className="homeheader-spacer" />
      </div>
    </div>
  );
}
