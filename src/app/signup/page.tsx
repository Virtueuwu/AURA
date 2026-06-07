import { Suspense } from "react";
import SignupForm from "./SignupForm";

export const metadata = {
  title: "Create Account — AURA AI Scanner",
  description: "Sign up for a free AURA account",
};

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
