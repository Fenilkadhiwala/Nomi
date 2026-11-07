import { AuthForm } from "@/src/components/Auth/AuthForm";
import { AuthLayout } from "@/src/components/Auth/AuthLayout";

export default function LoginPage() {
  return (
    <AuthLayout>
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
