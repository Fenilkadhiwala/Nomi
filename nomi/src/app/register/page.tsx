import { AuthForm } from "@/src/components/Auth/AuthForm";
import { AuthLayout } from "@/src/components/Auth/AuthLayout";

export default function RegisterPage() {
  return (
    <AuthLayout>
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
