export default function StageLayout({ children }: { children: React.ReactNode }) {
  return <main className="m-gutter pb-[calc(var(--frame)+3rem)]">{children}</main>;
}
