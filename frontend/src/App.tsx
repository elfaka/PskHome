import { Route, Routes } from "react-router-dom";
import Home from "./pages/home/home";
import GoogleForm from "./pages/googleform/googleform";
import JsonPrettier from "./pages/jsonprettier/jsonprettier";

export default function App() {
  return (
    <div className="max-w-full min-h-screen mx-auto bg-[#ffffef]">
      <Routes>
        <Route path="/*" element={<Home />} />
        <Route path="/googleform/*" element={<GoogleForm />} />
        <Route path="/jsonprettier/*" element={<JsonPrettier />} />
      </Routes>
    </div>
  );
}
