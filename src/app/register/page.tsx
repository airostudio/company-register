import type { Metadata } from "next";
import { FormationWizard } from "@/components/wizard/formation-wizard";

export const metadata: Metadata = { title: "Register a company" };

export default function RegisterPage() {
  return <FormationWizard />;
}
