import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/page";
import Topbar from "./components/layout/Topbar";

export default function App() {
  return (
    <div>
      <Topbar />
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </div>
  );
}
