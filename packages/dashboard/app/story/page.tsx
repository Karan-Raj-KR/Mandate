import type { Metadata } from "next";
import { Story } from "@/components/story/story";

export const metadata: Metadata = {
  title: "Mandate: authority for AI agents that can only shrink",
  description: "Every hop carries a signed, provably narrower permit, and the payment service checks the whole chain before any money moves.",
};

export default function StoryPage() {
  return (
    <>
      <noscript><style>{`.story [style]{opacity:1!important;transform:none!important}`}</style></noscript>
      <Story />
    </>
  );
}
