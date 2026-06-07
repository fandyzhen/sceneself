import type { Metadata } from "next";
import type { Locale } from "@/i18n.config";
import { SceneLanding } from "./scene-landing";

export async function generateMetadata(props: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  await props.params;
  return {
    title: "SceneSelf — One selfie, a full scene set",
    description: "SceneSelf — one selfie, one imagined scene, a cohesive 9-photo set.",
  };
}

export default function Home() {
  return <SceneLanding />;
}
