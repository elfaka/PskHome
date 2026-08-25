import AnalyzePage from "@/components/googleform/analyze/AnalyzePage";
import { RequireGoogleFormAuth } from "@/components/googleform/GoogleFormShell";

export default function FormAnalyzePage() {
  return (
    <RequireGoogleFormAuth>
      <AnalyzePage />
    </RequireGoogleFormAuth>
  );
}
