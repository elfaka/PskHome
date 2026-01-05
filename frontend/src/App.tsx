import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/home";

export default function App() {
  return (
    <div className="max-w-full min-h-screen mx-auto bg-[#ffffef]">
      <Routes>
        <Route path="*" element={<Home />} />
      </Routes>
    </div>
  );
}
