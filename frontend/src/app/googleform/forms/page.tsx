import FormsList from "@/components/googleform/FormsList";
import { RequireGoogleFormAuth } from "@/components/googleform/GoogleFormShell";

export default function FormsPage() {
  return (
    <RequireGoogleFormAuth>
      <FormsList />
    </RequireGoogleFormAuth>
  );
}
