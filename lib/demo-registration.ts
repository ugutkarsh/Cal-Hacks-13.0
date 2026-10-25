/**
 * Join / register behavior for map event details.
 * - Mock events: local UI-only demo registration (never persisted).
 * - Imported listings with a source URL: open the host site; user must confirm
 *   after registering there (Trailmap cannot see Luma/Meetup RSVPs).
 */

export type DemoRegistrationState = {
  registered: boolean;
  message: string;
  /** External listing was opened; waiting for user confirm. */
  awaitingExternalConfirm: boolean;
};

export type DemoRegistrationEvent = {
  id?: string;
  isRegistrationOpen: boolean;
  provenance: "mock" | "supabase" | "apify" | "user";
  sourceUrl?: string | null;
};

export function initialDemoRegistration(
  alreadyRegistered = false,
): DemoRegistrationState {
  return {
    registered: alreadyRegistered,
    message: alreadyRegistered
      ? "Marked registered on this device after you confirmed the host listing."
      : "",
    awaitingExternalConfirm: false,
  };
}

/** True when join should leave Trailmap for the original listing. */
export function shouldOpenExternalRegistration(
  event: DemoRegistrationEvent,
): boolean {
  if (event.provenance === "mock") return false;
  const url = event.sourceUrl?.trim() ?? "";
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Apply a join attempt for mock/demo events only.
 * Imported listings must not auto-flip to registered.
 */
export function applyDemoJoin(
  current: DemoRegistrationState,
  event: DemoRegistrationEvent,
): DemoRegistrationState {
  if (shouldOpenExternalRegistration(event)) {
    return {
      registered: false,
      awaitingExternalConfirm: true,
      message:
        "Opened the listing. After you finish on Luma/Meetup/Eventbrite, tap “I’ve registered”.",
    };
  }

  if (event.provenance !== "mock") {
    return {
      registered: false,
      awaitingExternalConfirm: false,
      message: event.sourceUrl
        ? "Open the original listing to register."
        : "No registration link for this imported event.",
    };
  }

  if (current.registered) {
    return {
      registered: true,
      awaitingExternalConfirm: false,
      message: "Already registered for this demo event",
    };
  }

  if (!event.isRegistrationOpen) {
    return {
      registered: false,
      awaitingExternalConfirm: false,
      message: "Registration is closed for this sample event.",
    };
  }

  return {
    registered: true,
    awaitingExternalConfirm: false,
    message: "Demo registration recorded (UI only — not saved to a server)",
  };
}

/** After the user finishes on the host site and confirms in Trailmap. */
export function confirmExternalJoin(
  current: DemoRegistrationState,
): DemoRegistrationState {
  return {
    registered: true,
    awaitingExternalConfirm: false,
    message:
      current.message ||
      "Marked registered on this device. Trailmap cannot verify Luma/Meetup RSVPs automatically.",
  };
}

export function demoJoinCaption(
  state: DemoRegistrationState,
  event: DemoRegistrationEvent,
): string {
  if (state.message) return state.message;
  if (state.registered) {
    return shouldOpenExternalRegistration(event)
      ? "You confirmed registration on this device (not synced from Luma)."
      : "You’re registered for this demo event";
  }
  if (shouldOpenExternalRegistration(event)) {
    return "Opens the original listing — then confirm here after you register";
  }
  if (event.provenance === "mock") return "Demo registration action";
  if (!event.isRegistrationOpen) return "Registration closed";
  return "Registration happens on the original listing";
}

export function joinButtonLabel(
  state: DemoRegistrationState,
  event: DemoRegistrationEvent,
): string {
  if (state.registered) return "You’re registered";
  if (shouldOpenExternalRegistration(event)) {
    return "Register on listing";
  }
  return "Join this event";
}
