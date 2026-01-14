import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/home";
import GoogleForm from "./pages/googleform/googleform";

export default function App() {
  return (
    <div className="max-w-full min-h-screen mx-auto bg-[#ffffef]">
      <Routes>
        <Route path="/*" element={<Home />} />
        <Route path="/googleform/*" element={<GoogleForm />} />
      </Routes>
    </div>
  );
}
