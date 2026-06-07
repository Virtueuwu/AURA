import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Login — AURA AI Scanner",
  description: "Sign in to your AURA account",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
