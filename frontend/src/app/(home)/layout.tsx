import SiteShell from "@/components/layout/SiteShell";

/** `/`, `/about`, `/project`, `/pspost/**` 공통 껍데기. */
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteShell>{children}</SiteShell>;
}
