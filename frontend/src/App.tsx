import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/page";
import TopBar from "./components/layout/TopBar";

export default function App() {
  return (
    <div>
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </div>
  );
}
