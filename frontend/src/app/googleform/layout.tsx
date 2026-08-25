import type { Metadata } from "next";

import GoogleFormShell from "@/components/googleform/GoogleFormShell";

export const metadata: Metadata = {
  title: "GoogleForm Analyzer",
};

export default function GoogleFormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GoogleFormShell>{children}</GoogleFormShell>;
}
