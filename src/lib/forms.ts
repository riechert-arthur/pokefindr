
import axios from "axios";
import { toast } from "sonner";

export function handleSubmitError(err: unknown) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const payload = err.response?.data;

    let msg: string;
    if (status) {
      if (typeof payload === "string") {
        msg = payload.trim();
      } else if (payload !== null && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string") {
        msg = (payload as { error: string }).error;
      } else if (
        payload !== null &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof (payload as { message: unknown }).message === "string"
      ) {
        msg = (payload as { message: string }).message;
      } else {
        msg = `Request failed with status code ${status}`;
      }
    } else {
      msg =
        "We couldn't reach the server. Please check your connection and try again.";
    }

    toast.error(msg);
  } else {
    toast.error("An unexpected error occurred");
  }
}

