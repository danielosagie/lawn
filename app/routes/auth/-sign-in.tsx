import { SignIn } from "@clerk/tanstack-react-start";
import { useRouterState } from "@tanstack/react-router";

export default function SignInPage() {
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const redirectUrl = new URLSearchParams(search).get("redirect_url");

  return (
    <SignIn
      fallbackRedirectUrl={redirectUrl || "/dashboard"}
      appearance={{
        elements: {
          // Primary button uses foreground/background pair so it
          // stays high-contrast in both themes (dark bg on cream in
          // light mode, cream bg on dark in dark mode). Hover sweeps
          // to orange in both.
          formButtonPrimary:
            "bg-[var(--foreground)] hover:bg-[#FF6600] text-[var(--background)] hover:text-[#f0f0e8] border-2 border-[var(--border)] rounded-none shadow-[4px_4px_0px_0px_var(--shadow-color)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] font-mono font-bold uppercase text-sm transition-all",
          card: "bg-[var(--background)] border-2 border-[var(--border)] rounded-none shadow-[8px_8px_0px_0px_var(--shadow-color)]",
          headerTitle:
            "text-[var(--foreground)] font-black uppercase tracking-tighter text-2xl font-mono",
          headerSubtitle: "text-[var(--foreground-muted)] font-mono",
          socialButtonsBlockButton:
            "border-2 border-[var(--border)] bg-transparent hover:bg-[var(--foreground)] text-[var(--foreground)] hover:text-[var(--background)] rounded-none transition-all hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_var(--shadow-color)] font-mono",
          socialButtonsBlockButtonText:
            "!text-current font-bold uppercase font-mono",
          socialButtonsBlockButtonArrow: "text-current",
          formFieldLabel:
            "text-[var(--foreground)] font-bold uppercase font-mono",
          formFieldInput:
            "bg-transparent border-2 border-[var(--border)] text-[var(--foreground)] focus:border-[#FF6600] focus:shadow-[4px_4px_0px_0px_var(--shadow-accent)] focus:ring-0 rounded-none font-mono",
          // OTP code inputs (the one-character cells used after
          // "Email a code"). Force the digit color to follow the
          // theme so dark mode shows white, light mode shows black.
          otpCodeFieldInput:
            "!text-[var(--foreground)] !bg-transparent !border-2 !border-[var(--border)] focus:!border-[#FF6600] !rounded-none font-mono",
          footerActionLink:
            "text-[#FF6600] hover:text-[var(--foreground)] font-bold font-mono",
          footerActionText: "text-[var(--foreground-muted)] font-mono",
          dividerLine: "bg-[var(--border)]",
          dividerText: "text-[var(--foreground-muted)] font-mono font-bold",
          identityPreviewText: "text-[var(--foreground)] font-mono",
          identityPreviewEditButton:
            "text-[#FF6600] hover:text-[var(--foreground)]",
          formFieldInputShowPasswordButton:
            "text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
          footer: "hidden",
          internal: "text-[var(--foreground)]",
        },
        variables: {
          colorPrimary: "#FF6600",
          colorBackground: "var(--background)",
          colorInputBackground: "transparent",
          colorInputText: "var(--foreground)",
          colorText: "var(--foreground)",
          colorTextSecondary: "var(--foreground-muted)",
          // Text that sits on top of the orange primary surface
          // is the same cream in both themes — orange is plenty
          // dark to read white text on.
          colorTextOnPrimaryBackground: "#f0f0e8",
          colorNeutral: "var(--border)",
          borderRadius: "0rem",
        },
      }}
    />
  );
}
