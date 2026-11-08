"use client";

import {
  Anchor,
  Button,
  Checkbox,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { ArrowRightIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { loginUser, registerUser } from "@/src/apis/api";
import { getApiError } from "@/src/lib/api/get-api-error";
import { notify } from "@/src/lib/notifications/notifications";

type AuthMode = "login" | "register";

interface AuthFormProps {
  mode: AuthMode;
}

interface FormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

const GREEN = "#244B3C";
const TEXT = "#202521";
const MUTED = "#777D75";
const BORDER = "#DDDED7";

const inputStyles = {
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: BORDER,
    color: TEXT,
    minHeight: 52,
    fontSize: 16,
  },
  label: {
    color: "#343B35",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 8,
  },
};

/**
 * Allow only internal application paths.
 *
 * Examples:
 * /invite/abc123 -> allowed
 * /dashboard -> allowed
 * https://evil.com -> rejected
 * //evil.com -> rejected
 * /\\evil.com -> rejected
 */
function getSafeRedirectPath(value: string | null): string {
  if (!value) {
    return "/dashboard";
  }

  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return "/dashboard";
  }

  // Invitation redirects are the only custom
  // redirects needed for this workflow.
  //
  // This also prevents unexpected destinations
  // such as /logout or another auth endpoint.
  const pathname = value.split(/[?#]/, 1)[0];

  if (/^\/invite\/[a-f0-9]{64}$/i.test(pathname)) {
    return value;
  }

  return "/dashboard";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const isRegister = mode === "register";

  // Preserve invitation URL through authentication.
  const redirectPath = getSafeRedirectPath(searchParams.get("next"));

  const hasInvitationRedirect = redirectPath.startsWith("/invite/");

  // Preserve redirect when switching auth modes.
  const alternateAuthPath = isRegister ? "/login" : "/register";

  const alternateAuthUrl = hasInvitationRedirect
    ? `${alternateAuthPath}?next=${encodeURIComponent(redirectPath)}`
    : alternateAuthPath;

  const form = useForm<FormValues>({
    mode: "uncontrolled",

    initialValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },

    validate: {
      name: (value) =>
        isRegister && value.trim().length < 2 ? "Enter your full name" : null,

      email: (value) =>
        /^\S+@\S+\.\S+$/.test(value.trim())
          ? null
          : "Enter a valid email address",

      password: (value) => {
        if (!value) {
          return "Password is required";
        }

        if (isRegister && value.length < 8) {
          return "Use at least 8 characters";
        }

        if (isRegister && value.length > 128) {
          return "Password must be 128 characters or fewer";
        }

        return null;
      },

      confirmPassword: (value, values) =>
        isRegister && value !== values.password
          ? "Passwords do not match"
          : null,

      acceptTerms: (value) =>
        isRegister && !value ? "Please accept the terms" : null,
    },
  });

  const handleSubmit = async (values: FormValues) => {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setLoading(true);

    try {
      const email = values.email.trim().toLowerCase();

      if (isRegister) {
        await registerUser({
          name: values.name.trim(),
          email,
          password: values.password,
        });

        notify.success({
          title: "Account created!",
          message: hasInvitationRedirect
            ? "Your account is ready. Continue to accept your invitation."
            : "Welcome to Nomi. Your account is ready.",
        });
      } else {
        await loginUser({
          email,
          password: values.password,
        });

        notify.success({
          title: "Welcome back!",
          message: hasInvitationRedirect
            ? "You've signed in. Continue to your invitation."
            : "You've signed in successfully.",
        });
      }

      // Normal authentication -> /dashboard
      // Invitation authentication -> /invite/[token]
      router.replace(redirectPath);
      router.refresh();
    } catch (error: unknown) {
      const apiError = getApiError(error);

      switch (apiError.code) {
        case "EMAIL_ALREADY_EXISTS":
          notify.error({
            title: "Account already exists",
            message:
              "An account with this email already exists. Please sign in.",
          });
          break;

        case "INVALID_CREDENTIALS":
          notify.error({
            title: "Incorrect credentials",
            message: "Incorrect email or password. Please try again.",
          });
          break;

        case "RATE_LIMITED":
          notify.warning({
            title: "Too many attempts",
            message: apiError.message,
          });
          break;

        case "VALIDATION_ERROR":
          notify.error({
            title: "Invalid details",
            message: apiError.message,
          });
          break;

        case "NETWORK_ERROR":
          notify.error({
            title: "Connection problem",
            message: apiError.message,
          });
          break;

        default:
          notify.error({
            title: isRegister ? "Registration failed" : "Unable to sign in",
            message: apiError.message,
          });
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Stack gap={0} w="100%">
      <Stack gap={10} mb={36}>
        <Title
          order={1}
          c={TEXT}
          fz={{
            base: 32,
            sm: 38,
            lg: 42,
          }}
          fw={700}
          lh={1.15}
          style={{
            letterSpacing: "-1.4px",
          }}
        >
          {isRegister ? "Meet your new AI assistant." : "Welcome back to Nomi."}
        </Title>

        <Text
          c={MUTED}
          fz={{
            base: 14,
            sm: 15,
          }}
          lh={1.6}
        >
          {isRegister
            ? "Create your account and let Nomi simplify everyday life at home."
            : "Your AI household assistant is ready when you are."}
        </Text>

        {hasInvitationRedirect && (
          <Text c={GREEN} fz={13} fw={600}>
            Sign in or create your account to continue to your group invitation.
          </Text>
        )}
      </Stack>

      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap={20}>
          {isRegister && (
            <TextInput
              key={form.key("name")}
              label="Full name"
              placeholder="Your full name"
              autoComplete="name"
              size="md"
              radius="md"
              styles={inputStyles}
              withAsterisk
              disabled={loading}
              {...form.getInputProps("name")}
            />
          )}

          <TextInput
            key={form.key("email")}
            label="Email address"
            placeholder="you@example.com"
            autoComplete="email"
            type="email"
            size="md"
            radius="md"
            styles={inputStyles}
            withAsterisk
            disabled={loading}
            {...form.getInputProps("email")}
          />

          <PasswordInput
            key={form.key("password")}
            label="Password"
            placeholder="Enter your password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            size="md"
            radius="md"
            styles={inputStyles}
            withAsterisk
            disabled={loading}
            {...form.getInputProps("password")}
          />

          {isRegister && (
            <PasswordInput
              key={form.key("confirmPassword")}
              label="Confirm password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              size="md"
              radius="md"
              styles={inputStyles}
              withAsterisk
              disabled={loading}
              {...form.getInputProps("confirmPassword")}
            />
          )}

          {isRegister && (
            <Checkbox
              key={form.key("acceptTerms")}
              size="sm"
              color="dark"
              disabled={loading}
              label="I agree to the Terms of Service and Privacy Policy"
              {...form.getInputProps("acceptTerms", {
                type: "checkbox",
              })}
            />
          )}

          <Button
            type="submit"
            fullWidth
            h={52}
            radius="md"
            loading={loading}
            disabled={loading}
            bg={GREEN}
            rightSection={<ArrowRightIcon size={18} />}
            mt={8}
            styles={{
              root: {
                fontSize: 15,
                fontWeight: 600,
              },
            }}
          >
            {isRegister ? "Create account" : "Sign in"}
          </Button>
        </Stack>
      </form>

      <Group justify="center" gap={5} mt={32} wrap="wrap">
        <Text size="sm" c={MUTED}>
          {isRegister ? "Already have an account?" : "New to Nomi?"}
        </Text>

        <Anchor
          component={Link}
          href={alternateAuthUrl}
          fw={700}
          size="sm"
          c={GREEN}
        >
          {isRegister ? "Sign in" : "Create an account"}
        </Anchor>
      </Group>
    </Stack>
  );
}
