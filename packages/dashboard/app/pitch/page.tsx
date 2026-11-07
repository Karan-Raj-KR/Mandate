import type { Metadata } from "next";
import { Pitch } from "@/components/pitch/pitch";

export const metadata: Metadata = {
  title: "Mandate: authority only narrows",
  description: "Signed delegation chains for AI agents. No hop can widen its parent's limits, and the service that acts checks the whole chain.",
};

export default function PitchPage() {
  return <Pitch />;
}
