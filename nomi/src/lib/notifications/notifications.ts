import { notifications } from "@mantine/notifications";

interface NotificationOptions {
  title?: string;
  message: string;
}

export const notify = {
  success: ({ title = "Success", message }: NotificationOptions) => {
    notifications.show({
      title,
      message,
      color: "green",
      autoClose: 4000,
      withCloseButton: true,
    });
  },

  error: ({ title = "Something went wrong", message }: NotificationOptions) => {
    notifications.show({
      title,
      message,
      color: "red",
      autoClose: 5000,
      withCloseButton: true,
    });
  },

  warning: ({ title = "Attention", message }: NotificationOptions) => {
    notifications.show({
      title,
      message,
      color: "yellow",
      autoClose: 5000,
      withCloseButton: true,
    });
  },
};
