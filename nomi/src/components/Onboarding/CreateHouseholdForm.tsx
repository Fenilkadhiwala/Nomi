"use client";

import {
  Anchor,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

import { useForm } from "@mantine/form";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  HouseLineIcon,
  MapPinIcon,
} from "@phosphor-icons/react";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

import { createHousehold } from "@/src/apis/api";
import { getApiError } from "@/src/lib/api/get-api-error";
import { notify } from "@/src/lib/notifications/notifications";

import { BORDER, GREEN, MUTED, TEXT } from "@/src/utils/constants";

countries.registerLocale(enLocale);

interface CreateHouseholdValues {
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

const fieldStyles = {
  input: {
    borderColor: BORDER,
    minHeight: 40,
    backgroundColor: "#FFFFFF",
    fontSize: 13,
  },
  label: {
    color: TEXT,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 4,
  },
};

export function CreateHouseholdForm() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const countryOptions = useMemo(() => {
    const countryNames = countries.getNames("en", {
      select: "official",
    });

    return Object.entries(countryNames)
      .map(([code, name]) => ({
        value: code,
        label: name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const form = useForm<CreateHouseholdValues>({
    mode: "uncontrolled",

    initialValues: {
      address_line_1: "",
      address_line_2: "",
      city: "",
      state: "",
      zip_code: "",
      country: "",
    },

    validate: {
      address_line_1: (value) => {
        if (!value.trim()) {
          return "Address line 1 is required";
        }

        return null;
      },

      city: (value) => {
        if (!value.trim()) {
          return "City is required";
        }

        return null;
      },

      state: (value) => {
        if (!value.trim()) {
          return "State or province is required";
        }

        return null;
      },

      zip_code: (value) => {
        if (!value.trim()) {
          return "ZIP or postal code is required";
        }

        return null;
      },

      country: (value) => {
        if (!value) {
          return "Please select a country";
        }

        return null;
      },
    },
  });

  const handleSubmit = async (values: CreateHouseholdValues) => {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setLoading(true);

    try {
      const result = await createHousehold({
        address_line_1: values.address_line_1.trim(),

        address_line_2: values.address_line_2.trim() || null,

        city: values.city.trim(),
        state: values.state.trim(),
        zip_code: values.zip_code.trim(),
        country: values.country,
      });

      notify.success({
        title: "Household created",
        message: "Your household is ready!",
      });

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      notify.error({
        title: "Unable to create household",
        message: getApiError(error).message,
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <Container size={680} pt={{ base: 12, sm: 16 }} pb={28}>
      {/* Back navigation */}
      <Anchor
        component="button"
        type="button"
        c={MUTED}
        fz={12}
        onClick={() => router.push("/onboarding")}
      >
        <Group gap={6}>
          <ArrowLeftIcon size={15} />
          Back
        </Group>
      </Anchor>

      {/* Compact heading */}
      <Group justify="center" align="center" gap={12} mt={12} mb={18}>
        <Box
          w={44}
          h={44}
          bg="#E2EEE6"
          style={{
            borderRadius: 13,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <HouseLineIcon size={24} color={GREEN} weight="duotone" />
        </Box>

        <Box>
          <Title
            order={1}
            fz={{ base: 23, sm: 27 }}
            fw={750}
            c={TEXT}
            style={{
              letterSpacing: "-0.6px",
            }}
          >
            Create your household
          </Title>

          <Text c={MUTED} fz={12} mt={2}>
            Set up your home and bring everyone together.
          </Text>
        </Box>
      </Group>

      {/* Address form */}
      <Paper
        p={{ base: 18, sm: 24 }}
        radius="lg"
        bg="white"
        style={{
          border: `1px solid ${BORDER}`,
        }}
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap={15}>
            {/* Section heading */}
            <Group gap={8}>
              <MapPinIcon size={18} color={GREEN} />

              <Text fw={700} fz={14} c={TEXT}>
                Household address
              </Text>
            </Group>

            <Text fz={12} c={MUTED}>
              Enter your household's address. You can update it later in
              settings.
            </Text>

            {/* Address line 1 */}
            <TextInput
              label="Address line 1"
              placeholder="Street address"
              required
              size="sm"
              radius="md"
              maxLength={255}
              styles={fieldStyles}
              key={form.key("address_line_1")}
              {...form.getInputProps("address_line_1")}
            />

            {/* Address line 2 */}
            <TextInput
              label="Address line 2"
              placeholder="Apartment, suite, unit (optional)"
              size="sm"
              radius="md"
              maxLength={255}
              styles={fieldStyles}
              key={form.key("address_line_2")}
              {...form.getInputProps("address_line_2")}
            />

            {/* City and state */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="City"
                placeholder="Enter city"
                required
                size="sm"
                radius="md"
                maxLength={120}
                styles={fieldStyles}
                key={form.key("city")}
                {...form.getInputProps("city")}
              />

              <TextInput
                label="State / Province"
                placeholder="Enter state or province"
                required
                size="sm"
                radius="md"
                maxLength={120}
                styles={fieldStyles}
                key={form.key("state")}
                {...form.getInputProps("state")}
              />
            </SimpleGrid>

            {/* Postal code and country */}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="ZIP / Postal code"
                placeholder="Enter postal code"
                required
                size="sm"
                radius="md"
                maxLength={20}
                styles={fieldStyles}
                key={form.key("zip_code")}
                {...form.getInputProps("zip_code")}
              />

              <Select
                label="Country"
                placeholder="Select country"
                required
                searchable
                nothingFoundMessage="No country found"
                limit={20}
                size="sm"
                radius="md"
                data={countryOptions}
                styles={fieldStyles}
                key={form.key("country")}
                {...form.getInputProps("country")}
              />
            </SimpleGrid>

            {/* Submit button */}
            <Button
              type="submit"
              fullWidth
              h={44}
              radius="md"
              bg={GREEN}
              loading={loading}
              disabled={loading}
              rightSection={<ArrowRightIcon size={17} />}
              mt={4}
            >
              Create household
            </Button>
          </Stack>
        </form>
      </Paper>

      <Text mt={12} ta="center" c={MUTED} fz={11}>
        You'll automatically become the owner of this household.
      </Text>
    </Container>
  );
}
